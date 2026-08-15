/*
 * AI 审美系统 · 问卷后台服务（零依赖）
 * - 用内建 node:sqlite 持久化受访者库（跨设备/跨浏览器共享）
 * - 同源托管前端静态文件
 * - 提供 REST API：GET/PUT /api/db、GET /api/health
 *
 * 运行：  node server.js            （默认端口 3000，静态根目录为工作区根：含「研究控制台」index.html、问卷系统/、盲审/、ai-aesthetic-engine/）
 *        PORT=8080 STATIC_DIR=/path/to/root node server.js
 */
'use strict';
// 进程级兜底：单条请求若触发未捕获异常/拒绝，只记录、不退出整个进程。
// 配合 watchdog.js 的崩溃重启，可避免个别偶发错误拖垮服务。
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('node:child_process');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const backup = require('./backup');
const mailer = require('./email'); // 零依赖 SMTP 客户端（QQ邮箱 验证码发信）

const PORT = parseInt(process.env.PORT || '3000', 10);
// 静态根目录：默认是 backend 的上两级目录（即工作区根，含研究控制台 index.html 与 问卷系统/ 等子项目），可用 STATIC_DIR 覆盖
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', '..'));
const DB_FILE = path.join(__dirname, 'data.db');

// ---------- 加载 backend/.env（若存在）：使即梦等密钥无需每次手动传入 ----------
// 仅在环境变量未设置时补全，显式传入的环境变量优先。注意：.env 含敏感密钥，请勿提交/外传。
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const k = m[1]; const v = m[2].replace(/^["']|["']$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
} catch (e) { /* 忽略 .env 读取错误 */ }

// 管理员邮箱（优先于首个注册自举）：命中即置为管理员。配置于 backend/.env 的 ADMIN_EMAIL。
// 注意：必须在 .env 加载之后读取，否则拿不到 .env 里的值。
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
// 自助重置密码用的共享重置码：配置于 backend/.env 的 RESET_CODE。
// 后端无邮件服务，用「邮箱 + 重置码 + 新密码」即可自助重置，无需旧密码、无需邮件。
// 未配置则关闭自助重置（/api/auth/forgot-password 返回 501，提示联系管理员）。
const RESET_CODE = (process.env.RESET_CODE || '').trim();

// ---------- 数据库 ----------
const db = new DatabaseSync(DB_FILE);
db.exec('CREATE TABLE IF NOT EXISTS respondents (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
// 商业闭环地基：账户表（为空，待接入注册/登录）与真实用量表（替代原先 quota.json 本地假计数）
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  pass_hash TEXT,
  created_at TEXT
);`);
// 管理员标记：命中 ADMIN_EMAIL 的账户、或系统中尚无任何账户时首个注册者即为管理员。
// 当前产品无付费/套餐，管理员仅用于绕过出图配额与后续管理权限。
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* 列已存在 */ }
// 邮箱验证码重置：一次性 6 位码，加盐哈希存储（不存明文），5 分钟过期，限尝试次数。
db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);`);
db.exec(`CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (user_id, type)
);`);
// 出图事件日志：每次成功出图记一行（带 created_at），用于看板「按天出图趋势」独立统计，不依赖 usage 累计表
db.exec(`CREATE TABLE IF NOT EXISTS image_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT,
  n INTEGER NOT NULL DEFAULT 1
);`);
// 账户会话：token → user_id，用于登录态鉴权
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT,
  expires_at TEXT
);`);
// 账户专属档案：登录用户可持久化其测评结果（解决「刷新即丢」）
// 注意：这是「最新一次」的覆盖式快照，历史沉淀见下方 assessments 表。保留它是为了兼容旧前端与管理端摘要。
db.exec(`CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  data TEXT
);`);
// 测评历史：每次保存追加一条，不再覆盖。用户的审美画像会随时间变化，
// 只留最新一条等于把用户的数据资产清零，也无法回看/对比。
// 摘要字段（title/mood/answer_count/frameworks/vector）冗余出来，
// 让列表页无需解析每条 data 大字段即可渲染时间线。
db.exec(`CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT,
  title TEXT,
  mood TEXT,
  answer_count INTEGER,
  frameworks TEXT,
  vector TEXT,
  data TEXT
);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments (user_id, created_at DESC);');
// 迁移：支持游客暂存测评。原 assessments.user_id 为 NOT NULL，游客无账户，
// 故加 guest_key 列并把 user_id 放宽成可空——游客记录 user_id 为 NULL、guest_key 标记设备。
// 用「整表重建」方式落地（SQLite 不支持直接 DROP NOT NULL），旧数据原样保留。
(function migrateAssessments(){
  try {
    const cols = db.prepare('PRAGMA table_info(assessments)').all().map(c => c.name);
    if (cols.includes('guest_key')) return; // 已迁移过
    db.exec(`CREATE TABLE assessments_new (
      id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, title TEXT,
      mood TEXT, answer_count INTEGER, frameworks TEXT, vector TEXT, data TEXT,
      guest_key TEXT
    );`);
    db.exec(`INSERT INTO assessments_new (id, user_id, created_at, title, mood, answer_count, frameworks, vector, data, guest_key)
      SELECT id, user_id, created_at, title, mood, answer_count, frameworks, vector, data, NULL FROM assessments;`);
    db.exec('DROP TABLE assessments;');
    db.exec('ALTER TABLE assessments_new RENAME TO assessments;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments (user_id, created_at DESC);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_assessments_guest ON assessments (guest_key);');
    console.log('[migrate] assessments 已支持游客暂存（guest_key）');
  } catch (e) { console.error('[migrate] assessments 迁移失败：', e && e.message); }
})();
// 每用户历史上限：超出后淘汰最旧的，避免单账户无限增长把库撑爆
const HISTORY_MAX = parseInt(process.env.HISTORY_MAX || '50', 10);
// 匿名/游客锚点：未登录体验共享一份全局配额，与迁移前 quota.json 的全局共享行为一致
const ANON_USER = 'anonymous';
// 游客试用：映射引擎对未登录访客开放但按「IP + 自然日」限额，兼顾拉新漏斗与防批量抓取。
// 引擎代码本身已不下发浏览器，此处仅防止有人用脚本穷举组合来反推映射表。
db.exec(`CREATE TABLE IF NOT EXISTS trial (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (ip, day, type)
);`);
// 额度取宽松值：一次完整测评含反复调权重通常 20~40 次请求，60 次够用；
// 而穷举反推映射表需要成千上万次组合，仍被挡住。
const TRIAL_LIMIT = parseInt(process.env.TRIAL_LIMIT || '60', 10);
const TRIAL_LIMIT_SCENE = TRIAL_LIMIT * 3; // 场景页三个 tab 切换较频繁，放宽

// 公开分享：任何人（含游客）都能生成一张对外传播的美学卡片，拿到可分享链接。
// 这是「神性测评」天然的拉新钩子——人愿意把「我是哪种气质」晒出去。
// owner_id 可空（游客也能分享，但无法在管理端归因到账户）；views 用于观察传播度。
db.exec(`CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  created_at TEXT,
  title TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  data TEXT
);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares (owner_id);');
// 分享卡有效期：旧数据无 expires_at 列，按「永久有效」处理；新建分享默认 7 天过期。
// ALTER 若列已存在会报错，用 try/catch 静默忽略。
try { db.exec('ALTER TABLE shares ADD COLUMN expires_at TEXT'); } catch (e) {}
// 3D 雕塑：旧数据无 model_path 列，按「无 3D」处理
try { db.exec('ALTER TABLE shares ADD COLUMN model_path TEXT'); } catch (e) {}

// 分享卡配图落盘目录：出图返回的是 data:image/png;base64 巨串（单张常数 MB），
// 直接塞进 shares.data 会让 SQLite 迅速膨胀且每次读卡都要搬运整串。
// 因此建卡时把 base64 解码成静态文件，库里只留一条 /share-images/xxx.png 路径。
const SHARE_IMG_DIR = path.join(__dirname, 'share-images');
try { fs.mkdirSync(SHARE_IMG_DIR, { recursive: true }); } catch (e) {}
const SHARE_IMG_MAX = 8 * 1024 * 1024; // 单张配图上限 8MB，超出则放弃配图（卡片仍可用海报兜底）

// 分享卡 3D 雕塑：按需（由本会话/管理员）生成后落盘到此目录，库里只存一条 /share-models/<id>.glb 路径。
const SHARE_MODEL_DIR = path.join(__dirname, 'share-models');
// 引擎页「生成我的神性雕塑」：登录用户触发的混元生3D 结果落盘到此目录，库里只存 /3d-models/<id>.glb 路径。
const MODEL_DIR = path.join(__dirname, '3d-models');
try { fs.mkdirSync(MODEL_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(SHARE_MODEL_DIR, { recursive: true }); } catch (e) {}
// 引擎页「神性视频」：登录用户触发的混元视频（文生视频 / 图生视频特效）结果落盘到此目录，库里只存 /videos/<id>.mp4 路径。
const VIDEO_DIR = path.join(__dirname, 'videos');
try { fs.mkdirSync(VIDEO_DIR, { recursive: true }); } catch (e) {}
function removeShareModel(id) {
  ['glb', 'obj', 'zip'].forEach(ext => {
    const f = path.join(SHARE_MODEL_DIR, id + '.' + ext);
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
  });
}

// 公开分享链接任何人可打开，因此存库前必须做白名单净化：
// 逐题作答（engine.answers）能反推出用户在每道题上的私人选择，属隐私，绝不外发。
// 只保留「展示这张卡片所必需」的字段。
function sanitizeShareData(d) {
  const out = {
    meta: d.meta || null,
    results: d.results || null,
    vector: d.vector || null,
    explanation: d.explanation || null,
    package: d.package || null
  };
  if (d.engine && typeof d.engine === 'object') {
    // 保留「启用了哪些框架、各自权重」以说明结果怎么来的；不含 answers
    out.engine = { enabled: d.engine.enabled || null, weights: d.engine.weights || null };
  }
  // 视频 / 3D 雕塑：分享时一并打包，按 URL / 路径字符串原样保留（非逐题作答，无脱敏风险）
  if (typeof d.video === 'string' && d.video) out.video = d.video;
  if (typeof d.model3d === 'string' && d.model3d) out.model3d = d.model3d;
  return out;
}

// 把分享携带的配图落成静态文件，返回可公开访问的相对路径；无法处理则返回 null
function persistShareImage(id, image) {
  if (typeof image !== 'string' || !image) return null;
  if (/^https?:\/\//i.test(image)) return image;           // 已是外链，直接引用
  if (/^\/share-images\//.test(image)) return image;        // 已落盘过（重复分享同一张）
  const m = image.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  let buf;
  try { buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64'); } catch (e) { return null; }
  if (!buf.length || buf.length > SHARE_IMG_MAX) return null;
  const name = id + '.' + ext;
  try { fs.writeFileSync(path.join(SHARE_IMG_DIR, name), buf); } catch (e) { return null; }
  return '/share-images/' + name;
}

// 删除分享时一并清掉它的配图（含 OG 预览图），避免磁盘上留下无主文件
function removeShareImage(id) {
  [id, id + '_og'].forEach(base => {
    ['png', 'jpeg', 'webp'].forEach(ext => {
      const f = path.join(SHARE_IMG_DIR, base + '.' + ext);
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
    });
  });
}

// ---------- 分享页的社交预览（OG / Twitter Card） ----------
// share.html 的内容全靠前端 JS 渲染，而微信、飞书、Telegram、Slack 这些抓取器
// 只读首屏 HTML、不执行脚本 —— 不注入 meta 的话，分享出去就是一条没有标题、
// 没有配图的裸链接，前面做的海报根本露不出来，拉新钩子等于白做。
// 因此这里在响应 share.html 时按 id 把 meta 直接写进 <head>。
function escHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 从请求头还原对外可见的站点根地址（反代场景下以 x-forwarded-* 为准）。
// host 来自请求头、不可信，做字符白名单，避免被塞进 meta 里做 HTML 注入。
function reqOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[A-Za-z0-9.\-:[\]]+$/.test(host)) return '';
  if (!/^https?$/.test(proto)) return '';
  return proto + '://' + host;
}

function shareDescription(data) {
  const prof = (data && data.package && data.package.profile) || {};
  const mood = Array.isArray(prof.moodWords) ? prof.moodWords.join(' · ') : '';
  const exp = String((data && data.explanation) || '').replace(/\s+/g, ' ').trim();
  let d = mood ? '气质关键词：' + mood + '。' : '';
  if (exp) d += exp;
  if (!d) d = '一份由 AI 审美系统生成的个人审美气质画像。';
  return d.length > 110 ? d.slice(0, 109) + '…' : d;
}

// 把一条分享记录渲染成 <head> 里的社交 meta；origin 为空时退化为相对路径（本地直连仍可用）
function buildShareMeta(row, origin) {
  let data = {};
  try { data = JSON.parse(row.data) || {}; } catch (e) {}
  const title = (row.title || '我的神性测评') + ' · AI 审美系统';
  const desc = shareDescription(data);
  // OG 横版图专供社交缩略图；没有就退回 AI 出图；都没有则不给图（好过给一张裁烂的）
  const rawImg = data.ogImage || data.image || '';
  const img = rawImg && !/^https?:\/\//i.test(rawImg) ? origin + rawImg : rawImg;
  const pageUrl = origin + '/ai-aesthetic-engine/share.html?id=' + row.id;
  const tags = [
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="AI 审美系统 · 神性测评">',
    '<meta property="og:title" content="' + escHTML(title) + '">',
    '<meta property="og:description" content="' + escHTML(desc) + '">',
    '<meta property="og:url" content="' + escHTML(pageUrl) + '">',
    '<meta name="description" content="' + escHTML(desc) + '">'
  ];
  if (img) {
    tags.push('<meta property="og:image" content="' + escHTML(img) + '">');
    tags.push('<meta property="og:image:width" content="1200">');
    tags.push('<meta property="og:image:height" content="630">');
    tags.push('<meta name="twitter:card" content="summary_large_image">');
    tags.push('<meta name="twitter:image" content="' + escHTML(img) + '">');
  } else {
    tags.push('<meta name="twitter:card" content="summary">');
  }
  tags.push('<meta name="twitter:title" content="' + escHTML(title) + '">');
  tags.push('<meta name="twitter:description" content="' + escHTML(desc) + '">');
  return { title, html: tags.join('\n') + '\n' };
}

// ---------- 匿名出图配额校准（计费锚点，详见 /api/generate-image）----------
// 真实出图走即梦等付费/限频 API；匿名访客共享一个全局池，必须同时受两层约束，
// 否则单个 IP 或少量访客就能把整池真实额度耗尽，挤掉登录用户与所有者。
// 这两个值按「真实 API 的每日预算」校准：per-IP 是单访客体验上限，全局池是总预算天花板。
const ANON_IMG_QUOTA = parseInt(process.env.ANON_IMG_QUOTA || '50', 10);   // 全局匿名池（所有游客共享）每日上限
const ANON_IMG_PER_IP = parseInt(process.env.ANON_IMG_PER_IP || '5', 10);  // 单 IP 每日匿名出图上限（防单个访客刷穿全局池）

function today() { return new Date().toISOString().slice(0, 10); }
// 取真实访客 IP：部署在反代/网关后时优先取 X-Forwarded-For 首段。
// XFF 可伪造，但此处只是轻量防刷（非计费、非鉴权），可接受。
function clientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) { const first = String(xff).split(',')[0].trim(); if (first) return first; }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
// ---------- 速率限制（内存滑动窗口，零依赖） ----------
// 目的不是精确计费，而是挡住三类明显的滥用：登录暴力破解、写接口刷量、整体扫描。
// 计数放内存（重启即清空）——对单机部署足够；多实例部署时应换成共享存储。
const RL_BUCKETS = {
  // 桶名          窗口(ms)  上限   说明
  login:   { win: 15 * 60e3, max: 10 },  // 15 分钟 10 次：正常人改不了这么多次密码
  register:{ win: 60 * 60e3, max: 5  },  // 1 小时 5 个账号
  reset:   { win: 15 * 60e3, max: 5  },  // 15 分钟 5 次：发验证码/试码都走这，防轰炸收件箱
  write:   { win: 60e3,      max: 30 },  // 写接口：分享/存档/整库写
  read:    { win: 60e3,      max: 240 }, // 读接口：留足页面正常轮询的余量
};
const rlHits = new Map();   // key = 桶名|标识 → { count, reset }
let rlBlocked = 0;          // 累计拦截次数，供管理后台观察
function rateLimit(req, res, bucket, keyExtra) {
  const cfg = RL_BUCKETS[bucket];
  if (!cfg) return false;
  const key = bucket + '|' + clientIP(req) + (keyExtra ? '|' + keyExtra : '');
  const now = Date.now();
  let rec = rlHits.get(key);
  if (!rec || now >= rec.reset) { rec = { count: 0, reset: now + cfg.win }; rlHits.set(key, rec); }
  rec.count++;
  if (rec.count > cfg.max) {
    rlBlocked++;
    const retry = Math.max(1, Math.ceil((rec.reset - now) / 1000));
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(retry) });
    res.end(JSON.stringify({ error: '请求过于频繁，请 ' + retry + ' 秒后再试', retryAfter: retry }));
    return true; // 已响应，调用方直接 return
  }
  return false;
}
// 登录失败额外记一笔：成功登录不该被计入惩罚，否则正常用户换设备就被锁
function rateLimitPenalty(req, bucket) {
  const cfg = RL_BUCKETS[bucket]; if (!cfg) return;
  const key = bucket + '|' + clientIP(req);
  const now = Date.now();
  let rec = rlHits.get(key);
  if (!rec || now >= rec.reset) { rec = { count: 0, reset: now + cfg.win }; rlHits.set(key, rec); }
  rec.count++;
}
// 过期窗口清理：不清会随 IP 数无限增长
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rlHits) if (now >= v.reset) rlHits.delete(k);
}, 5 * 60e3).unref();

function loadTrial(ip, type) {
  const limit = type === 'scene' ? TRIAL_LIMIT_SCENE
              : type === 'image' ? ANON_IMG_PER_IP
              : TRIAL_LIMIT;
  try {
    const row = db.prepare('SELECT count FROM trial WHERE ip = ? AND day = ? AND type = ?').get(ip, today(), type);
    const used = row ? row.count : 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch { return { used: 0, limit, remaining: limit }; }
}
function addTrial(ip, type, n = 1) {
  const d = today(), now = new Date().toISOString();
  db.prepare(`INSERT INTO trial (ip, day, type, count, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ip, day, type) DO UPDATE SET count = count + ?, updated_at = ?`).run(ip, d, type, n, now, n, now);
}

function getDB() {
  const rows = db.prepare('SELECT data FROM respondents').all();
  const out = [];
  for (const r of rows) {
    try { const o = JSON.parse(r.data); if (o && typeof o === 'object') out.push(o); } catch (e) { /* 跳过损坏行 */ }
  }
  return out;
}
function putDB(arr) {
  const ins = db.prepare('INSERT OR REPLACE INTO respondents (id, data) VALUES (?, ?)');
  const del = db.prepare('DELETE FROM respondents');
  db.exec('BEGIN');
  try {
    del.run();
    for (const r of arr) {
      const id = (r && r.id != null) ? String(r.id) : ('_' + Math.random().toString(36).slice(2));
      ins.run(id, JSON.stringify(r));
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
  return arr.length;
}

// ---------- 工具 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.glb': 'model/vnd.gltf-binary', '.gltf': 'model/gltf+json',
  '.obj': 'text/plain; charset=utf-8', '.zip': 'application/zip'
};
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  // 必须含 Authorization，否则跨源场景下浏览器预检会拦掉 Bearer 鉴权头
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
// ---------- 静态服务的安全边界 ----------
// STATIC_DIR 是整个工作区根，而 backend 就躺在它下面 —— 这意味着默认情况下
// data.db（邮箱 / 密码哈希 / 会话 token / 全部测评）、logs/、backups/、server.js
// 都能被任何人用一条 GET 直接拖走。这些文件没有任何需要被公开访问的理由，
// 因此在静态处理入口整体挡掉：
//   1) backend 目录（及其全部子目录）—— 服务端代码与数据的所在地；
//   2) 危险扩展名 —— 防止同类文件出现在工作区其它位置时再次裸奔。
const BACKEND_DIR = path.normalize(__dirname);
const BLOCKED_EXT = new Set([
  '.db', '.db-wal', '.db-shm', '.sqlite', '.sqlite3',
  '.log', '.key', '.pem', '.p12', '.pfx', '.env'
]);
// 按目录名拦截，而不是只认 __dirname：STATIC_DIR 可被覆盖，工作区里也可能存在
// backend 的副本/旧版本，只锁当前进程所在目录会漏掉这些同样含源码与库的位置。
const BLOCKED_DIRNAMES = new Set(['backend', 'backups', 'logs', 'node_modules']);
function isProtectedPath(fp) {
  const norm = path.normalize(fp);
  // 当前 backend 目录整体不对外（用 path.sep 收尾，避免 “backendX” 这类前缀误判）
  if (norm === BACKEND_DIR || norm.startsWith(BACKEND_DIR + path.sep)) return true;
  // 路径中出现受保护目录名即拒绝
  const rel = path.relative(path.normalize(STATIC_DIR), norm);
  if (rel && !rel.startsWith('..')) {
    const segs = rel.split(path.sep).filter(Boolean);
    // 最后一段是文件名，只检查目录段；目录本身被请求时也一并挡掉
    for (let i = 0; i < segs.length; i++) if (BLOCKED_DIRNAMES.has(segs[i].toLowerCase())) return true;
  }
  return BLOCKED_EXT.has(path.extname(norm).toLowerCase());
}

function serveFile(fp, res) {
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

// 启动后自动打开浏览器（NO_OPEN=1 可禁用，便于无桌面环境 / 远程部署）
function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'darwin' ? 'open'
            : process.platform === 'win32' ? 'start ""'
            : 'xdg-open';
  exec(`${cmd} "${url}"`, () => { /* 忽略：无桌面环境时静默失败 */ });
}

// ---------- 账户 / 会话（零依赖，scrypt 哈希 + Bearer token） ----------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 会话有效期 30 天
const RESET_CODE_TTL_MS = 5 * 60e3;  // 邮箱验证码有效期 5 分钟
const RESET_CODE_MAX_TRIES = 5;      // 单个验证码最多试 5 次
const RESET_CODE_LEN = 6;            // 6 位数字验证码
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function genToken() { return crypto.randomBytes(24).toString('hex'); }
// 常量时间比较，避免重置码/令牌被计时侧信道猜解
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8'), bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function createSession(userId) {
  const token = genToken();
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, now, exp);
  return token;
}
function getTokenFromReq(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function getUserByToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const u = db.prepare('SELECT id, email, created_at, is_admin FROM users WHERE id = ?').get(s.user_id);
  return u || null;
}
function publicUser(u) { return u ? { id: u.id, email: u.email, created_at: u.created_at, is_admin: !!u.is_admin } : null; }

// ---------- 出图配额 & 并发串行（模块级，启动即初始化，避免每请求重建 / TDZ）----------
// 即梦模型：并发上限 1、账号总额度有限（默认 200）。下面两机制保证稳定、可控。
// 配额改为 SQLite 真实计数（usage 表），替代原先 quota.json 本地假计数。
const QUOTA_LIMIT = parseInt(process.env.IMG_QUOTA || '200', 10);
// isAdmin=true 时返回 limit:-1（无限，前端识别为 ∞），且 /api/generate-image 不再拦截。
function loadQuota(userId, isAdmin) {
  if (isAdmin) return { used: 0, limit: -1, unlimited: true };
  // 匿名访问共享全局池（ANON_IMG_QUOTA），登录用户用各自的 IMG_QUOTA —— 二者是独立的计费锚点
  const limit = (userId === ANON_USER) ? ANON_IMG_QUOTA : QUOTA_LIMIT;
  try {
    const row = db.prepare('SELECT count FROM usage WHERE user_id = ? AND type = ?').get(userId, 'image');
    return { used: row ? row.count : 0, limit, unlimited: false };
  } catch { return { used: 0, limit, unlimited: false }; }
}
// 真实出图成功后累加用量（按 用户×类型 唯一键；先查后插/更，避免依赖具体 SQLite UPSERT 语法）
function addUsage(userId, n = 1) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT count FROM usage WHERE user_id = ? AND type = ?').get(userId, 'image');
  if (existing) {
    db.prepare('UPDATE usage SET count = count + ?, updated_at = ? WHERE user_id = ? AND type = ?').run(n, now, userId, 'image');
  } else {
    db.prepare('INSERT INTO usage (user_id, type, count, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'image', n, now);
  }
  // 记一笔出图事件日志（独立时序数据，供按天趋势统计；失败不影响主用量累加）
  try {
    db.prepare('INSERT INTO image_log (id, user_id, created_at, n) VALUES (?, ?, ?, ?)')
      .run(Date.now() + '-' + Math.random().toString(36).slice(2, 8), userId, now, n);
  } catch (e) { /* 趋势统计非关键路径，忽略 */ }
}
// 出图并发池：最多同时 GEN_CONCURRENCY 个出图在飞（减少排队等待），但仍是受控并发。
// 之前是严格串行（1 个），多人/多次点击时后面要干等；提升到 3 可在不压垮云端的前提下明显降等待。
const GEN_CONCURRENCY = 3;
let genRunning = 0;
const genQueue = [];
function enqueueGen(task) {
  return new Promise((resolve, reject) => {
    genQueue.push({ task, resolve, reject });
    pumpGen();
  });
}
function pumpGen() {
  while (genRunning < GEN_CONCURRENCY && genQueue.length) {
    const { task, resolve, reject } = genQueue.shift();
    genRunning++;
    Promise.resolve().then(task).then(resolve, reject).finally(() => { genRunning--; pumpGen(); });
  }
}

// 3D 生成专用串行队列（与出图队列独立，避免一个长耗时的 3D 任务阻塞出图）
let _3dChain = Promise.resolve();
function enqueue3D(task) {
  const run = _3dChain.then(task, task);
  _3dChain = run.catch(() => {});
  return run;
}

// 视频生成专用串行队列（与出图 / 3D 队列独立，避免长耗时视频任务互相阻塞）
let _videoChain = Promise.resolve();
function enqueueVideo(task) {
  const run = _videoChain.then(task, task);
  _videoChain = run.catch(() => {});
  return run;
}

// ---------- 异步生成任务（根治「长连接被网络抖动掐断，几分钟的活儿白做」）----------
// 三个生成接口改为：前端 POST 立刻拿到 jobId，之后轮询 /api/job/:id 取结果。
// 任务在服务器后台跑：客户端网络抖一下只是轮询暂停几秒，任务照跑完，恢复后照取结果。
const GEN_JOBS = new Map(); // id -> { id, status, progress, result, error, code, createdAt }
function createJob() {
  const id = 'j_' + crypto.randomBytes(9).toString('hex');
  const job = { id, status: 'pending', progress: 0, result: null, error: null, code: null, createdAt: Date.now() };
  GEN_JOBS.set(id, job);
  return job;
}
// 兜底守卫：任务超过 JOB_TTL 仍未结束（provider 卡死等），标记为超时错误，避免前端无限轮询。
const JOB_TTL = 12 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of GEN_JOBS) {
    if (now - job.createdAt > JOB_TTL && job.status === 'pending') {
      job.status = 'error'; job.code = 500; job.error = '生成任务超时（服务端守卫 12 分钟）';
    }
    // 已完成/失败的任务再保留 30 分钟供前端补取，随后清理（仅内存，重启即清空）
    if (job.status !== 'pending' && now - job.createdAt > 30 * 60 * 1000) GEN_JOBS.delete(id);
  }
}, 60 * 1000).unref();

// ---------- 映射引擎（核心 IP，仅运行于服务端，前端不加载 engine.js / generator.js / scenarios.js）----------
// 引擎模块为 UMD：Node 端 require 即得到 { run, mapToVector, explain } / { generate } / { houseLayout, outfit, quotes }。
const AE_DIR = path.join(STATIC_DIR, 'ai-aesthetic-engine');
let Engine = null, Generator = null, Scenarios = null;
try {
  Engine = require(path.join(AE_DIR, 'engine.js'));
  Generator = require(path.join(AE_DIR, 'generator.js'));
  Scenarios = require(path.join(AE_DIR, 'scenarios.js')); // 内部 require('./generator') 取母题表
} catch (e) {
  console.error('[engine] 加载映射引擎失败：', e && e.message);
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  setCORS(res);
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  // 全局兜底限流：只管 /api（静态资源不限，否则正常加载页面就会被误伤）。
  // 管理员豁免——后台要批量拉列表，按普通读上限会卡住。
  if (p.startsWith('/api/')) {
    const rlMe = getUserByToken(getTokenFromReq(req));
    if (!(rlMe && rlMe.is_admin)) {
      const bucket = (req.method === 'GET' || req.method === 'HEAD') ? 'read' : 'write';
      if (rateLimit(req, res, bucket)) return;
    }
  }

  // API
  if (p === '/api/health') { sendJSON(res, 200, { ok: true, storage: 'sqlite', file: DB_FILE }); return; }
  if (p === '/api/db') {
    // 这里存的是全部受访者的原始作答，属研究数据；PUT 还能整库覆盖。
    // 之前无鉴权 —— 任何人都能拖走或清空，必须收成管理员专属。
    const me = getUserByToken(getTokenFromReq(req));
    if (!me) return sendJSON(res, 401, { error: '需要登录' });
    if (!me.is_admin) return sendJSON(res, 403, { error: '需要管理员权限' });
    if (req.method === 'GET') { sendJSON(res, 200, getDB()); return; }
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const body = await readBody(req);
        const arr = JSON.parse(body);
        if (!Array.isArray(arr)) return sendJSON(res, 400, { error: 'expected JSON array' });
        const n = putDB(arr);
        return sendJSON(res, 200, { ok: true, count: n });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }
    res.writeHead(405); res.end(); return;
  }

  // ---------- 账户：注册 / 登录 / 登出 / 当前用户 ----------
  if (p.startsWith('/api/auth/')) {
    if (p === '/api/auth/register' && req.method === 'POST') {
      if (rateLimit(req, res, 'register')) return; // 防批量注册刷号
      try {
        const body = JSON.parse(await readBody(req));
        const email = (body.email || '').trim().toLowerCase();
        const pw = body.password || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: '邮箱格式不正确' });
        if (pw.length < 6) return sendJSON(res, 400, { error: '密码至少 6 位' });
        if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return sendJSON(res, 409, { error: '该邮箱已注册' });
        const id = 'u_' + crypto.randomBytes(8).toString('hex');
        const now = new Date().toISOString();
        // 管理员判定：命中 ADMIN_EMAIL 即管理员。
        // 仅当未配置 ADMIN_EMAIL 时，才退回「首个注册者即管理员」的冷启动自举；
        // 一旦配置了 ADMIN_EMAIL，禁用自举，避免陌生人抢先注册白拿管理员。
        const isAdmin = ADMIN_EMAIL
          ? (email === ADMIN_EMAIL)
          : (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0);
        db.prepare('INSERT INTO users (id, email, pass_hash, created_at, is_admin) VALUES (?, ?, ?, ?, ?)')
          .run(id, email, hashPassword(pw), now, isAdmin ? 1 : 0);
        const token = createSession(id);
        const u = db.prepare('SELECT id, email, created_at, is_admin FROM users WHERE id = ?').get(id);
        return sendJSON(res, 200, { token, user: publicUser(u) });
      } catch (e) { return sendJSON(res, 500, { error: String(e && e.message || e) }); }
    }
    if (p === '/api/auth/login' && req.method === 'POST') {
      if (rateLimit(req, res, 'login')) return; // 防暴力破解
      try {
        const body = JSON.parse(await readBody(req));
        const email = (body.email || '').trim().toLowerCase();
        const pw = body.password || '';
        const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!u || !verifyPassword(pw, u.pass_hash)) {
          // 失败额外记一笔：猜密码的成本翻倍，正常人输错一两次不受影响
          rateLimitPenalty(req, 'login');
          return sendJSON(res, 401, { error: '邮箱或密码错误' });
        }
        // 命中 ADMIN_EMAIL 则补置管理员（兼容「先注册、后配置 ADMIN_EMAIL」的情况）
        if (ADMIN_EMAIL && email === ADMIN_EMAIL && !u.is_admin) {
          db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id);
        }
        const token = createSession(u.id);
        const u2 = db.prepare('SELECT id, email, created_at, is_admin FROM users WHERE id = ?').get(u.id);
        return sendJSON(res, 200, { token, user: publicUser(u2) });
      } catch (e) { return sendJSON(res, 500, { error: String(e && e.message || e) }); }
    }
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const token = getTokenFromReq(req);
      if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/auth/me' && req.method === 'GET') {
      const u = getUserByToken(getTokenFromReq(req));
      if (!u) return sendJSON(res, 401, { error: '未登录' });
      return sendJSON(res, 200, { user: publicUser(u) });
    }
    // 自助重置密码：邮箱 + 重置码（backend/.env 的 RESET_CODE）+ 新密码，无需旧密码。
    // 与登录共用限流桶，防暴力试重置码；重置码错误额外记一笔惩罚。
    if (p === '/api/auth/forgot-password' && req.method === 'POST') {
      if (rateLimit(req, res, 'login')) return;
      if (!RESET_CODE) return sendJSON(res, 501, { error: '未配置重置码，无法自助重置；请让管理员在 backend/.env 设置 RESET_CODE，或用管理后台重置' });
      try {
        const body = JSON.parse(await readBody(req));
        const email = (body.email || '').trim().toLowerCase();
        const code = body.resetCode || '';
        const npw = body.newPassword || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: '邮箱格式不正确' });
        if (npw.length < 6) return sendJSON(res, 400, { error: '新密码至少 6 位' });
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (!u) return sendJSON(res, 404, { error: '该邮箱未注册' });
        if (!safeEqual(code, RESET_CODE)) {
          rateLimitPenalty(req, 'login');
          return sendJSON(res, 403, { error: '重置码错误' });
        }
        db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(npw), u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // 失效全部会话，逼重新登录
        return sendJSON(res, 200, { ok: true, message: '密码已重置，请用新密码登录' });
      } catch (e) { return sendJSON(res, 500, { error: String(e && e.message || e) }); }
    }
    // 邮箱验证码重置（QQ邮箱 SMTP）：两步 —— 先请求验证码，再校验验证码设新密码。
    // 与 RESET_CODE 离线重置并存：未配置 SMTP 时前端回退到 RESET_CODE 方案。
    if (p === '/api/auth/forgot-request' && req.method === 'POST') {
      if (rateLimit(req, res, 'reset')) return;
      if (!mailer.isSmtpConfigured()) return sendJSON(res, 501, { error: '邮件服务未配置，无法发送验证码；请用「重置码」方式重置，或联系管理员配置 SMTP' });
      try {
        const body = JSON.parse(await readBody(req));
        const email = (body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: '邮箱格式不正确' });
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        // 不暴露邮箱是否注册：无论是否存在都返回同样文案；仅当存在才真正发信（防用户枚举）
        if (u) {
          const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 位
          const expires = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();
          db.prepare('INSERT OR REPLACE INTO password_resets (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)')
            .run(email, hashPassword(code), expires);
          try {
            await mailer.sendResetCode(email, code, Math.round(RESET_CODE_TTL_MS / 60000));
          } catch (e) {
            return sendJSON(res, 502, { error: '验证码邮件发送失败：' + (e && e.message || e) });
          }
        }
        return sendJSON(res, 200, { ok: true, message: '若该邮箱已注册，验证码已发送至邮箱（' + Math.round(RESET_CODE_TTL_MS / 60000) + ' 分钟内有效）' });
      } catch (e) { return sendJSON(res, 500, { error: String(e && e.message || e) }); }
    }
    if (p === '/api/auth/forgot-verify' && req.method === 'POST') {
      if (rateLimit(req, res, 'reset')) return;
      try {
        const body = JSON.parse(await readBody(req));
        const email = (body.email || '').trim().toLowerCase();
        const code = (body.code || '').trim();
        const npw = body.newPassword || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: '邮箱格式不正确' });
        if (npw.length < 6) return sendJSON(res, 400, { error: '新密码至少 6 位' });
        if (!/^\d{6}$/.test(code)) return sendJSON(res, 400, { error: '请输入 6 位验证码' });
        const row = db.prepare('SELECT email, code_hash, expires_at, attempts FROM password_resets WHERE email = ?').get(email);
        if (!row) return sendJSON(res, 400, { error: '请先获取验证码' });
        if (new Date(row.expires_at).getTime() < Date.now()) {
          db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
          return sendJSON(res, 400, { error: '验证码已过期，请重新获取' });
        }
        if (row.attempts >= RESET_CODE_MAX_TRIES) {
          db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
          return sendJSON(res, 429, { error: '验证码尝试次数过多，请重新获取' });
        }
        if (!verifyPassword(code, row.code_hash)) {
          db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?').run(email);
          return sendJSON(res, 403, { error: '验证码错误' });
        }
        const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (!u) { db.prepare('DELETE FROM password_resets WHERE email = ?').run(email); return sendJSON(res, 404, { error: '该邮箱未注册' }); }
        db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(npw), u.id);
        db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // 失效全部会话
        return sendJSON(res, 200, { ok: true, message: '密码已重置，请用新密码登录' });
      } catch (e) { return sendJSON(res, 500, { error: String(e && e.message || e) }); }
    }
    res.writeHead(404); res.end(); return;
  }

  // ---------- 账户专属：测评档案 / 用量（需登录） ----------
  if (p === '/api/me/profile' || p === '/api/me/usage') {
    const u = getUserByToken(getTokenFromReq(req));
    if (!u) return sendJSON(res, 401, { error: '未登录' });
    if (p === '/api/me/usage') {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      return sendJSON(res, 200, loadQuota(u.id, !!u.is_admin));
    }
    // /api/me/profile
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        db.prepare('INSERT OR REPLACE INTO profiles (user_id, data) VALUES (?, ?)').run(u.id, JSON.stringify(body));
        return sendJSON(res, 200, { ok: true });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }
    if (req.method === 'GET') {
      const row = db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(u.id);
      return sendJSON(res, 200, row ? JSON.parse(row.data) : null);
    }
    res.writeHead(405); res.end(); return;
  }

  // ---------- 测评历史：登录用户按账户存；游客凭 X-Guest-Key 暂存本机（登录后归户）----------
  // 与 /api/me/profile 的区别：profile 是覆盖式「最新一份」，这里是追加式时间线。
  if (p === '/api/me/assessments') {
    const u = getUserByToken(getTokenFromReq(req));
    // 归属解析：登录用户优先（绑定 user_id）；其次游客凭 X-Guest-Key（绑定 guest_key）。
    // 既未登录又无 guest_key 则拦为 401，引导登录 / 由前端自动生成游客标识。
    const guestKey = (req.headers['x-guest-key'] || '').toString().trim();
    const scope = u ? { kind: 'user', id: u.id }
                   : (guestKey ? { kind: 'guest', id: guestKey } : null);
    if (!scope) return sendJSON(res, 401, { error: '未登录', needLogin: true });

    const col = scope.kind === 'user' ? 'user_id' : 'guest_key';

    // 通用：插入一条记录，超上限淘汰最旧；登录用户同时刷新覆盖式 profile
    function insertAssessment(rec) {
      const id = 'a_' + crypto.randomBytes(8).toString('hex');
      const now = new Date().toISOString();
      if (scope.kind === 'user') {
        db.prepare(`INSERT INTO assessments (id, user_id, created_at, title, mood, answer_count, frameworks, vector, data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, scope.id, now, rec.title, rec.mood, rec.answerCount, rec.frameworks, JSON.stringify(rec.vector), JSON.stringify(rec.body));
        db.prepare('INSERT OR REPLACE INTO profiles (user_id, data) VALUES (?, ?)').run(scope.id, JSON.stringify(rec.body));
      } else {
        db.prepare(`INSERT INTO assessments (id, user_id, created_at, title, mood, answer_count, frameworks, vector, data, guest_key)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, now, rec.title, rec.mood, rec.answerCount, rec.frameworks, JSON.stringify(rec.vector), JSON.stringify(rec.body), scope.id);
      }
      const total = db.prepare('SELECT COUNT(*) c FROM assessments WHERE ' + col + ' = ?').get(scope.id).c;
      let pruned = 0;
      if (total > HISTORY_MAX) {
        const old = db.prepare('SELECT id FROM assessments WHERE ' + col + ' = ? ORDER BY created_at ASC LIMIT ?')
          .all(scope.id, total - HISTORY_MAX);
        old.forEach(r => { db.prepare('DELETE FROM assessments WHERE id = ?').run(r.id); pruned++; });
      }
      return { id, now, total: Math.min(total, HISTORY_MAX), pruned };
    }

    // 新增一条历史（body = 前端 buildExport() 的结构，可带 title）
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const body = JSON.parse(await readBody(req));
        const eng = body.engine || {};
        const pkg = body.package || body.pkg || null;
        const answerCount = eng.answers ? Object.keys(eng.answers).length : 0;
        if (!answerCount) return sendJSON(res, 400, { error: '没有作答数据，无法保存' });
        const frameworks = eng.enabled ? Object.keys(eng.enabled).filter(k => eng.enabled[k]).join(',') : '';
        const mood = (pkg && pkg.profile && Array.isArray(pkg.profile.moodWords)) ? pkg.profile.moodWords.join('、') : '';
        const nowISO = new Date().toISOString();
        const title = String(body.title || '').trim().slice(0, 60) || (mood ? mood : '测评 ' + nowISO.slice(0, 16).replace('T', ' '));
        const { id, now, total, pruned } = insertAssessment({ title, mood, answerCount, frameworks, vector: body.vector || null, body });
        return sendJSON(res, 200, { ok: true, id, created_at: now, title, total, pruned, max: HISTORY_MAX, guest: scope.kind === 'guest' });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }

    // 取单条完整数据（?id=）或列表（不带 id：只回摘要，避免把几十份完整方案一次打过去）
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const row = db.prepare('SELECT * FROM assessments WHERE id = ? AND ' + col + ' = ?').get(id, scope.id);
        if (!row) return sendJSON(res, 404, { error: '记录不存在' });
        let data = null; try { data = JSON.parse(row.data); } catch (e) {}
        return sendJSON(res, 200, { id: row.id, created_at: row.created_at, title: row.title, data });
      }
      const rows = db.prepare(`SELECT id, created_at, title, mood, answer_count, frameworks, vector
        FROM assessments WHERE ` + col + ` = ? ORDER BY created_at DESC`).all(scope.id);
      return sendJSON(res, 200, {
        items: rows.map(r => ({
          id: r.id, created_at: r.created_at, title: r.title, mood: r.mood,
          answerCount: r.answer_count,
          frameworks: r.frameworks ? r.frameworks.split(',') : [],
          vector: (() => { try { return JSON.parse(r.vector); } catch (e) { return null; } })()
        })),
        total: rows.length, max: HISTORY_MAX, guest: scope.kind === 'guest'
      });
    }

    // 重命名
    if (req.method === 'PATCH') {
      try {
        const body = JSON.parse(await readBody(req));
        const id = body.id || '';
        const title = String(body.title || '').trim().slice(0, 60);
        if (!title) return sendJSON(res, 400, { error: '标题不能为空' });
        const r = db.prepare('UPDATE assessments SET title = ? WHERE id = ? AND ' + col + ' = ?').run(title, id, scope.id);
        if (!r.changes) return sendJSON(res, 404, { error: '记录不存在' });
        return sendJSON(res, 200, { ok: true, id, title });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }

    // 删除
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      const r = db.prepare('DELETE FROM assessments WHERE id = ? AND ' + col + ' = ?').run(id, scope.id);
      if (!r.changes) return sendJSON(res, 404, { error: '记录不存在' });
      return sendJSON(res, 200, { ok: true, id });
    }

    res.writeHead(405); res.end(); return;
  }

  // ---------- 游客归户：登录后把本机暂存的测评并入当前账户（转化钩子）----------
  if (p === '/api/me/assessments/claim' && req.method === 'POST') {
    const u = getUserByToken(getTokenFromReq(req));
    if (!u) return sendJSON(res, 401, { error: '未登录' });
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const gk = (body.guestKey || '').toString().trim();
      if (!gk) return sendJSON(res, 400, { error: '缺少 guestKey' });
      // 只迁移属于该 guest_key 且尚未归户的游客记录
      const claimed = db.prepare('UPDATE assessments SET user_id = ?, guest_key = NULL WHERE guest_key = ? AND user_id IS NULL')
        .run(u.id, gk);
      const total = db.prepare('SELECT COUNT(*) c FROM assessments WHERE user_id = ?').get(u.id).c;
      let pruned = 0;
      if (total > HISTORY_MAX) {
        const old = db.prepare('SELECT id FROM assessments WHERE user_id = ? ORDER BY created_at ASC LIMIT ?').all(u.id, total - HISTORY_MAX);
        old.forEach(r => { db.prepare('DELETE FROM assessments WHERE id = ?').run(r.id); pruned++; });
      }
      // 刷新覆盖式 profile 为最新一条（含刚归户的），保持「读取最近一次」指向最新
      const newest = db.prepare('SELECT data FROM assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(u.id);
      if (newest) db.prepare('INSERT OR REPLACE INTO profiles (user_id, data) VALUES (?, ?)').run(u.id, newest.data);
      return sendJSON(res, 200, { ok: true, claimed: claimed.changes, pruned, total: Math.min(total, HISTORY_MAX), max: HISTORY_MAX });
    } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
  }

  // ---------- 公开分享：生成 / 读取 / 删除一张可传播的美学卡片 ----------
  // 任何人（含未登录游客）都能创建；读取与浏览统计公开；删除仅本人或管理员。
  if (p === '/api/share') {
    // 创建分享（POST）。登录则把 owner 记为该用户，否则匿名。
    if (req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const data = body.data || body.payload || null;
        if (!data || typeof data !== 'object') return sendJSON(res, 400, { error: '缺少分享内容' });
        // 最低校验：必须有向量或框架结果，避免存空壳
        if (!data.vector && !data.results && !data.package) return sendJSON(res, 400, { error: '分享内容缺少测评结果' });
        const mood = (data.package && data.package.profile && Array.isArray(data.package.profile.moodWords))
          ? data.package.profile.moodWords.join('、') : '';
        const nowISO = new Date().toISOString();
        const title = String(body.title || '').trim().slice(0, 80) || (mood ? mood : '我的神性测评 · ' + nowISO.slice(0, 10));
        const owner = getUserByToken(getTokenFromReq(req));
        const id = 's_' + crypto.randomBytes(9).toString('hex');
        // 分享卡默认 7 天后自动失效；旧数据（无 expires_at）视为永久有效
        const SHARE_TTL_DAYS = 7;
        const expiresISO = new Date(Date.now() + SHARE_TTL_DAYS * 864e5).toISOString();
        // 脱敏：公开链接不得携带逐题作答
        const safe = sanitizeShareData(data);
        // 配图落盘：把 base64 大串换成静态路径，库里只存路径
        const imgPath = persistShareImage(id, data.image);
        if (imgPath) safe.image = imgPath;
        // OG 横版预览图（前端渲染的 1200×630 海报）：社交平台抓的是它，与主视觉分开存
        const ogPath = persistShareImage(id + '_og', body.ogImage);
        if (ogPath) safe.ogImage = ogPath;
        db.prepare(`INSERT INTO shares (id, owner_id, created_at, title, views, data, expires_at)
          VALUES (?, ?, ?, ?, 0, ?, ?)`)
          .run(id, owner ? owner.id : null, nowISO, title, JSON.stringify(safe), expiresISO);
        return sendJSON(res, 200, { ok: true, id, title, image: imgPath || null, url: '/ai-aesthetic-engine/share.html?id=' + id });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }
    res.writeHead(405); res.end(); return;
  }

  // 单条分享：GET 公开读取并把 views +1；DELETE 仅本人/管理员可删
  // POST 写入 3D 雕塑路径（owner 或管理员）：由本会话/管理员在生成后挂载
  const mShare = p.match(/^\/api\/share\/([A-Za-z0-9_\-]+)$/);
  if (mShare && (req.method === 'GET' || req.method === 'DELETE' || req.method === 'POST')) {
    const id = mShare[1];
    const row = db.prepare('SELECT * FROM shares WHERE id = ?').get(id);
    if (!row) return sendJSON(res, 404, { error: '分享不存在或已删除' });
    if (req.method === 'DELETE') {
      const me = getUserByToken(getTokenFromReq(req));
      if (!me) return sendJSON(res, 401, { error: '未登录' });
      if (row.owner_id && row.owner_id !== me.id && !me.is_admin) return sendJSON(res, 403, { error: '无权删除' });
      db.prepare('DELETE FROM shares WHERE id = ?').run(id);
      removeShareImage(id); removeShareModel(id); // 连带清掉磁盘上的配图/模型，避免留下无主文件
      return sendJSON(res, 200, { ok: true, id });
    }
    if (req.method === 'POST') {
      const me = getUserByToken(getTokenFromReq(req));
      if (!me) return sendJSON(res, 401, { error: '未登录' });
      if (row.owner_id && row.owner_id !== me.id && !me.is_admin) return sendJSON(res, 403, { error: '无权操作此分享' });
      try {
        const body = JSON.parse(await readBody(req));
        // 只允许挂到本站生成的模型路径，杜绝任意外链/目录穿越
        const mp = typeof body.model_path === 'string' ? body.model_path : '';
        if (mp && !/^\/share-models\/s_[A-Za-z0-9_]+\.(?:glb|obj|zip)$/.test(mp)) {
          return sendJSON(res, 400, { error: 'model_path 必须是 /share-models/<id>.(glb|obj|zip)' });
        }
        db.prepare('UPDATE shares SET model_path = ? WHERE id = ?').run(mp || null, id);
        return sendJSON(res, 200, { ok: true, id, model_path: mp || null });
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }
    // GET：先校验有效期（expires_at 为空表示永久有效）
    const nowISO = new Date().toISOString();
    if (row.expires_at && row.expires_at < nowISO) {
      return sendJSON(res, 410, { error: '分享已过期失效', expired: true });
    }
    // GET：公开，views +1（并发下偶尔少计可接受，非核心计数）
    db.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').run(id);
    let data = null; try { data = JSON.parse(row.data); } catch (e) {}
    return sendJSON(res, 200, {
      id: row.id, title: row.title, created_at: row.created_at,
      expires_at: row.expires_at || null, model_path: row.model_path || null,
      views: row.views + 1, owner_id: row.owner_id, data
    });
  }

  // ---------- 管理后台（仅 is_admin 可访问）----------
  // 无付费/套餐：这里只做「看得见 + 管得住」——用户、用量、档案、会话。
  if (p.startsWith('/api/admin/')) {
    const me = getUserByToken(getTokenFromReq(req));
    if (!me) return sendJSON(res, 401, { error: '未登录' });
    if (!me.is_admin) return sendJSON(res, 403, { error: '需要管理员权限' });

    // 备份：列表 / 手动触发
    if (p === '/api/admin/backups' && req.method === 'GET') {
      return sendJSON(res, 200, Object.assign({ ok: true }, backup.status(), { items: backup.list() }));
    }
    if (p === '/api/admin/backup' && req.method === 'POST') {
      const r = backup.runOnce(db);
      return sendJSON(res, r.ok ? 200 : 500, Object.assign({}, r, { status: backup.status() }));
    }
    // 删除单个备份（name 严格校验，防目录穿越）
    if (p === '/api/admin/backup' && req.method === 'DELETE') {
      const name = url.searchParams.get('name') || '';
      const r = backup.remove(name);
      return sendJSON(res, r.ok ? 200 : 400, Object.assign({}, r, { status: backup.status() }));
    }
    // 主动清理：只保留最新 keep 份（管理员手动触发，相当于「定时删除」的手动版）
    if (p === '/api/admin/backups/cleanup' && req.method === 'POST') {
      const r = backup.cleanup();
      return sendJSON(res, 200, r);
    }
    // 批量删除备份：接收 {names:[...]}，逐个调用 backup.remove（自带严格命名校验，防穿越）
    if (p === '/api/admin/backups/delete' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const names = Array.isArray(body.names) ? body.names : [];
        const removed = [], failed = [];
        for (const n of names) {
          const rr = backup.remove(n);
          if (rr.ok) removed.push(n);
          else failed.push({ name: n, error: rr.error || '删除失败' });
        }
        return sendJSON(res, 200, Object.assign({ ok: true, removed, failed }, { status: backup.status() }));
      } catch (e) { return sendJSON(res, 400, { error: String((e && e.message) || e) }); }
    }

    // 总览统计
    if (p === '/api/admin/stats' && req.method === 'GET') {
      const q = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch (e) { return null; } };
      const nowISO = new Date().toISOString();
      const userCount = (q('SELECT COUNT(*) c FROM users') || {}).c || 0;
      const adminCount = (q('SELECT COUNT(*) c FROM users WHERE is_admin = 1') || {}).c || 0;
      const profileCount = (q('SELECT COUNT(*) c FROM profiles') || {}).c || 0;
      const assessmentCount = (q('SELECT COUNT(*) c FROM assessments') || {}).c || 0;
      const assessments7d = (q('SELECT COUNT(*) c FROM assessments WHERE created_at > ?', new Date(Date.now() - 7 * 864e5).toISOString()) || {}).c || 0;
      // 游客暂存（user_id 为空）：能反映「未登录也愿意留下测评」的转化漏斗底端
      const guestAssessmentCount = (q("SELECT COUNT(*) c FROM assessments WHERE user_id IS NULL") || {}).c || 0;
      const guestKeys = (q("SELECT COUNT(DISTINCT guest_key) c FROM assessments WHERE user_id IS NULL") || {}).c || 0;
      const liveSessions = (q('SELECT COUNT(*) c FROM sessions WHERE expires_at > ?', nowISO) || {}).c || 0;
      const imgTotal = (q("SELECT COALESCE(SUM(count),0) s FROM usage WHERE type = 'image'") || {}).s || 0;
      const imgAnon = (q("SELECT COALESCE(SUM(count),0) s FROM usage WHERE type = 'image' AND user_id = ?", ANON_USER) || {}).s || 0;
      const respondents = (q('SELECT COUNT(*) c FROM respondents') || {}).c || 0;
      const shareCount = (q('SELECT COUNT(*) c FROM shares') || {}).c || 0;
      const shareViews = (q('SELECT COALESCE(SUM(views),0) s FROM shares') || {}).s || 0;
      const last7 = new Date(Date.now() - 7 * 864e5).toISOString();
      const newUsers7d = (q('SELECT COUNT(*) c FROM users WHERE created_at > ?', last7) || {}).c || 0;
      // 游客试用漏斗：今日有多少独立 IP 在体验、共打了多少次引擎
      const d = today();
      // 跨类型去重：只逛了生活场景页、没跑引擎的访客同样算今日游客，否则数字偏低
      const trialIPsToday = (q('SELECT COUNT(DISTINCT ip) c FROM trial WHERE day = ?', d) || {}).c || 0;
      const trialCallsToday = (q("SELECT COALESCE(SUM(count),0) s FROM trial WHERE day = ? AND type = 'engine'", d) || {}).s || 0;
      const trialIPsTotal = (q('SELECT COUNT(DISTINCT ip) c FROM trial') || {}).c || 0;
      const trialExhausted = (q("SELECT COUNT(*) c FROM trial WHERE day = ? AND type = 'engine' AND count >= ?", d, TRIAL_LIMIT) || {}).c || 0;
      // 近 14 天每日测评趋势（看板活跃度曲线）
      const trendDays = 14;
      const trendStart = new Date(Date.now() - (trendDays - 1) * 864e5).toISOString();
      const trendRows = db.prepare("SELECT substr(created_at,1,10) d, COUNT(*) c FROM assessments WHERE created_at >= ? GROUP BY d").all(trendStart) || [];
      const trendMap = {};
      trendRows.forEach(r => { trendMap[r.d] = r.c; });
      const trend = [];
      for (let i = 0; i < trendDays; i++) {
        const dt = new Date(Date.now() - (trendDays - 1 - i) * 864e5);
        const key = dt.toISOString().slice(0, 10);
        trend.push({ date: key.slice(5), count: trendMap[key] || 0 });
      }
      // 近 14 天每日出图趋势（image_log 事件日志聚合）
      const imgTrendRows = db.prepare("SELECT substr(created_at,1,10) d, COALESCE(SUM(n),0) c FROM image_log WHERE created_at >= ? GROUP BY d").all(trendStart) || [];
      const imgTrendMap = {};
      imgTrendRows.forEach(r => { imgTrendMap[r.d] = r.c; });
      const imageTrend = [];
      for (let i = 0; i < trendDays; i++) {
        const dt = new Date(Date.now() - (trendDays - 1 - i) * 864e5);
        const key = dt.toISOString().slice(0, 10);
        imageTrend.push({ date: key.slice(5), count: imgTrendMap[key] || 0 });
      }
      return sendJSON(res, 200, {
        userCount, adminCount, profileCount, liveSessions, newUsers7d,
        assessmentCount, assessments7d,
        guestAssessmentCount, guestKeys,
        imgTotal, imgAnon, imgByUsers: imgTotal - imgAnon,
        respondents, shareCount, shareViews,
        trialIPsToday, trialCallsToday, trialIPsTotal, trialExhausted,
        trialLimit: TRIAL_LIMIT,
        quotaLimit: QUOTA_LIMIT,
        anonImgLimit: ANON_IMG_QUOTA,
        anonImgPerIp: ANON_IMG_PER_IP,
        adminEmail: ADMIN_EMAIL || null,
        smtpConfigured: mailer.isSmtpConfigured(),
        engineReady: !!(Engine && Generator && Scenarios),
        rateLimitBlocked: rlBlocked,
        rateLimitWindows: rlHits.size,
        backup: backup.status(),
        serverTime: nowISO,
        trend,
        imageTrend
      });
    }

    // 分享卡列表（管理员可见全部；用于排查过期 / 清理违规卡）
    if (p === '/api/admin/shares' && req.method === 'GET') {
      const rows = db.prepare(
        'SELECT id, owner_id, created_at, expires_at, title, views FROM shares ORDER BY created_at DESC LIMIT 500'
      ).all();
      const nowISO = new Date().toISOString();
      const items = rows.map(r => ({
        id: r.id,
        title: r.title,
        owner_id: r.owner_id,
        created_at: r.created_at,
        expires_at: r.expires_at || null,
        expired: r.expires_at ? (r.expires_at < nowISO) : false,
        views: r.views
      }));
      return sendJSON(res, 200, { ok: true, shares: items });
    }

    // 延长 / 设置分享卡有效期（管理员）
    // mode: add7 | add30 | add365 | forever | set(expires_at 绝对时间)
    // 规则：已过期或永久有效(空) → 从「现在」起算延长；未过期 → 在当前 expires_at 基础上累加
    const mExpire = p.match(/^\/api\/admin\/share\/([A-Za-z0-9_\-]+)\/expire$/);
    if (mExpire && req.method === 'POST') {
      const id = mExpire[1];
      const row = db.prepare('SELECT id, expires_at FROM shares WHERE id = ?').get(id);
      if (!row) return sendJSON(res, 404, { error: '分享不存在' });
      try {
        const body = JSON.parse(await readBody(req));
        const mode = body.mode;
        const now = new Date();
        const cur = row.expires_at ? new Date(row.expires_at) : null;
        const base = (cur && cur > now) ? cur : now; // 未过期则累加，已过期/无限则从 now 起算
        let newExp = null;
        if (mode === 'forever') newExp = null;
        else {
          const addMatch = /^add(\d+)$/.exec(mode || '');
          if (addMatch) newExp = new Date(base.getTime() + parseInt(addMatch[1], 10) * 864e5);
          else if (mode === 'set' && body.expires_at) newExp = new Date(body.expires_at);
          else return sendJSON(res, 400, { error: '未知的 mode 或缺少 expires_at' });
        }
        const iso = newExp ? newExp.toISOString() : null;
        db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(iso, id);
        return sendJSON(res, 200, { ok: true, id, expires_at: iso });
      } catch (e) { return sendJSON(res, 400, { error: String((e && e.message) || e) }); }
    }

    // 用户列表（含用量 / 档案 / 活跃会话）
    if (p === '/api/admin/users' && req.method === 'GET') {
      const nowISO = new Date().toISOString();
      const rows = db.prepare('SELECT id, email, created_at, is_admin FROM users ORDER BY created_at DESC').all();
      const out = rows.map(u => {
        const usg = db.prepare("SELECT count, updated_at FROM usage WHERE user_id = ? AND type = 'image'").get(u.id);
        const prof = db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(u.id);
        const sess = db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND expires_at > ?').get(u.id, nowISO);
        const hist = db.prepare('SELECT COUNT(*) c, MAX(created_at) m FROM assessments WHERE user_id = ?').get(u.id);
        return {
          id: u.id, email: u.email, created_at: u.created_at,
          assessmentCount: hist ? hist.c : 0,
          lastAssessmentAt: hist ? hist.m : null,
          is_admin: !!u.is_admin,
          is_protected: !!(ADMIN_EMAIL && u.email === ADMIN_EMAIL), // 受 .env 保护，不可降级/删除
          is_self: u.id === me.id,
          imageUsed: usg ? usg.count : 0,
          lastImageAt: usg ? usg.updated_at : null,
          hasProfile: !!prof,
          liveSessions: sess ? sess.c : 0
        };
      });
      // 匿名池单独列出（不是 users 表里的行，但会消耗额度）
      const anon = db.prepare("SELECT count, updated_at FROM usage WHERE user_id = ? AND type = 'image'").get(ANON_USER);
      return sendJSON(res, 200, {
        users: out,
        anonymous: { id: ANON_USER, imageUsed: anon ? anon.count : 0, lastImageAt: anon ? anon.updated_at : null, limit: ANON_IMG_QUOTA }
      });
    }

    // 单用户详情（含其测评档案摘要）
    if (p === '/api/admin/user' && req.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      const u = db.prepare('SELECT id, email, created_at, is_admin FROM users WHERE id = ?').get(id);
      if (!u) return sendJSON(res, 404, { error: '用户不存在' });
      const row = db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(id);
      let profile = null;
      if (row) { try { profile = JSON.parse(row.data); } catch (e) { profile = null; } }
      // 只回摘要，避免把整包方案打到管理端造成巨大响应
      let summary = null;
      if (profile) {
        const pkg = profile.package || profile.pkg || null;
        summary = {
          exportedAt: (profile.meta && profile.meta.exportedAt) || null,
          enabled: (profile.engine && profile.engine.enabled) || null,
          answerCount: profile.engine && profile.engine.answers ? Object.keys(profile.engine.answers).length : 0,
          explanation: profile.explanation ? String(profile.explanation).slice(0, 300) : null,
          moodWords: pkg && pkg.profile && pkg.profile.moodWords ? pkg.profile.moodWords : null,
          vector: profile.vector || null
        };
      }
      const usg = db.prepare("SELECT count, updated_at FROM usage WHERE user_id = ? AND type = 'image'").get(id);
      // 测评时间线摘要（不含完整 data，管理端只需要知道「什么时候测了什么气质」）
      const history = db.prepare(`SELECT id, created_at, title, mood, answer_count, frameworks
        FROM assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(id)
        .map(r => ({
          id: r.id, created_at: r.created_at, title: r.title, mood: r.mood,
          answerCount: r.answer_count,
          frameworks: r.frameworks ? r.frameworks.split(',') : []
        }));
      return sendJSON(res, 200, {
        user: publicUser(u),
        imageUsed: usg ? usg.count : 0,
        lastImageAt: usg ? usg.updated_at : null,
        profileSummary: summary,
        history
      });
    }

    // 管理操作
    if (p === '/api/admin/users' && (req.method === 'PATCH' || req.method === 'POST')) {
      try {
        const body = JSON.parse(await readBody(req));
        const id = body.id || '';
        const action = body.action || '';
        const target = db.prepare('SELECT id, email, is_admin FROM users WHERE id = ?').get(id);
        if (!target) return sendJSON(res, 404, { error: '用户不存在' });
        const isProtected = !!(ADMIN_EMAIL && target.email === ADMIN_EMAIL);
        const isSelf = target.id === me.id;

        switch (action) {
          case 'grant_admin':
            db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(id);
            return sendJSON(res, 200, { ok: true, message: '已设为管理员' });

          case 'revoke_admin':
            // 自锁保护：不能撤销自己，也不能撤销 .env 指定的管理员，避免把系统锁死
            if (isSelf) return sendJSON(res, 400, { error: '不能撤销自己的管理员权限' });
            if (isProtected) return sendJSON(res, 400, { error: '该账户由 .env 的 ADMIN_EMAIL 指定，不可撤销' });
            db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(id);
            return sendJSON(res, 200, { ok: true, message: '已撤销管理员' });

          case 'reset_usage':
            db.prepare("DELETE FROM usage WHERE user_id = ? AND type = 'image'").run(id);
            return sendJSON(res, 200, { ok: true, message: '出图用量已清零' });

          case 'set_usage': {
            const n = Math.max(0, parseInt(body.count, 10) || 0);
            const now = new Date().toISOString();
            const ex = db.prepare("SELECT count FROM usage WHERE user_id = ? AND type = 'image'").get(id);
            if (ex) db.prepare("UPDATE usage SET count = ?, updated_at = ? WHERE user_id = ? AND type = 'image'").run(n, now, id);
            else db.prepare("INSERT INTO usage (user_id, type, count, updated_at) VALUES (?, 'image', ?, ?)").run(id, n, now);
            return sendJSON(res, 200, { ok: true, message: '用量已设为 ' + n });
          }

          case 'revoke_sessions':
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
            return sendJSON(res, 200, { ok: true, message: '该用户所有登录态已失效' });

          case 'reset_password':
            // 管理员兜底重置：当自助重置码也忘了/不可用，由管理员直接设新密码。
            // 受 ADMIN_EMAIL 保护的账户不可被他人重置（自锁保护），但本人可重置自己。
            if (isProtected && !isSelf) return sendJSON(res, 400, { error: '该账户由 .env 的 ADMIN_EMAIL 指定，不可被他人重置' });
            const npw = body.newPassword || '';
            if (npw.length < 6) return sendJSON(res, 400, { error: '新密码至少 6 位' });
            db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(npw), id);
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
            return sendJSON(res, 200, { ok: true, message: '密码已重置，请用新密码登录' });

          case 'delete':
            if (isSelf) return sendJSON(res, 400, { error: '不能删除自己的账户' });
            if (isProtected) return sendJSON(res, 400, { error: '该账户由 .env 的 ADMIN_EMAIL 指定，不可删除' });
            db.exec('BEGIN');
            try {
              db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
              db.prepare('DELETE FROM profiles WHERE user_id = ?').run(id);
              db.prepare('DELETE FROM assessments WHERE user_id = ?').run(id);
              db.prepare('DELETE FROM usage WHERE user_id = ?').run(id);
              db.prepare('DELETE FROM users WHERE id = ?').run(id);
              db.exec('COMMIT');
            } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
            return sendJSON(res, 200, { ok: true, message: '账户及其数据已删除' });

          default:
            return sendJSON(res, 400, { error: '未知操作：' + action });
        }
      } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
    }

    // 重置匿名池用量
    if (p === '/api/admin/anon/reset' && req.method === 'POST') {
      db.prepare("DELETE FROM usage WHERE user_id = ? AND type = 'image'").run(ANON_USER);
      return sendJSON(res, 200, { ok: true, message: '匿名池用量已清零' });
    }

    // 游客试用明细（今日各 IP 的调用次数）
    if (p === '/api/admin/trial' && req.method === 'GET') {
      const d = today();
      const rows = db.prepare(`SELECT ip,
          COALESCE(SUM(CASE WHEN type='engine' THEN count END),0) engine,
          COALESCE(SUM(CASE WHEN type='scene'  THEN count END),0) scene,
          COALESCE(SUM(CASE WHEN type='image'  THEN count END),0) image,
          MAX(updated_at) updated_at
        FROM trial WHERE day = ? GROUP BY ip ORDER BY (engine+scene+image) DESC LIMIT 200`).all(d);
      return sendJSON(res, 200, { day: d, engineLimit: TRIAL_LIMIT, sceneLimit: TRIAL_LIMIT_SCENE, imageLimit: ANON_IMG_PER_IP, rows });
    }

    // 清空试用记录：scope=today 仅今日，否则全部（放开被误伤/自测占满的 IP）
    if (p === '/api/admin/trial/reset' && req.method === 'POST') {
      let scope = 'all';
      try { const b = JSON.parse(await readBody(req) || '{}'); scope = b.scope || 'all'; } catch (e) { /* 无 body 视为 all */ }
      if (scope === 'today') db.prepare('DELETE FROM trial WHERE day = ?').run(today());
      else db.prepare('DELETE FROM trial').run();
      return sendJSON(res, 200, { ok: true, message: scope === 'today' ? '今日试用记录已清空' : '全部试用记录已清空' });
    }

    res.writeHead(404); res.end(); return;
  }

  // ---------- 映射引擎（核心 IP，服务端计算）----------
  // 引擎代码不下发浏览器，IP 已受保护，故对游客开放以保住拉新漏斗；
  // 未登录按「IP + 自然日」限额防脚本穷举，登录用户不限次。
  if (p === '/api/engine/generate' && req.method === 'POST') {
    const u = getUserByToken(getTokenFromReq(req));
    if (!Engine || !Generator) return sendJSON(res, 503, { error: '映射引擎未就绪' });
    let trial = null;
    if (!u) {
      const ip = clientIP(req);
      trial = loadTrial(ip, 'engine');
      if (trial.remaining <= 0) {
        return sendJSON(res, 429, {
          error: `游客试用今日已用完（${trial.used}/${trial.limit}），登录后不限次数`,
          trial, needLogin: true
        });
      }
      addTrial(ip, 'engine', 1);
      trial = loadTrial(ip, 'engine');
    }
    try {
      const body = JSON.parse(await readBody(req));
      const answers = body.answers || {};
      const sel = Array.isArray(body.sel) ? body.sel : (body.selected || []);
      const weights = body.weights || {};
      const aspectWeights = body.aspectWeights || {};
      if (!sel.length) return sendJSON(res, 400, { error: '未选择任何建模框架' });
      const out = Engine.run(answers, sel, weights, aspectWeights);
      const pkg = Generator.generate(out);
      return sendJSON(res, 200, {
        results: out.results,
        vector: out.vector,
        explanation: out.explanation,
        pkg,
        version: Generator.VERSION,
        trial // 登录用户为 null，前端据此显示「游客试用剩余 N 次」
      });
    } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
  }

  // ---------- 生活场景引擎（M3，服务端）----------
  // 同样对游客开放，独立且更宽松的试用池（三个 tab 切换频繁）
  if (p === '/api/scenarios' && req.method === 'POST') {
    const u = getUserByToken(getTokenFromReq(req));
    if (!Scenarios) return sendJSON(res, 503, { error: '场景引擎未就绪' });
    let trial = null;
    if (!u) {
      const ip = clientIP(req);
      trial = loadTrial(ip, 'scene');
      if (trial.remaining <= 0) {
        return sendJSON(res, 429, {
          error: `游客试用今日已用完（${trial.used}/${trial.limit}），登录后不限次数`,
          trial, needLogin: true
        });
      }
      addTrial(ip, 'scene', 1);
      trial = loadTrial(ip, 'scene');
    }
    try {
      const body = JSON.parse(await readBody(req));
      const pkg = body.pkg;
      const scene = body.scene;
      const fn = scene === 'house' ? 'houseLayout' : scene === 'outfit' ? 'outfit' : scene === 'quotes' ? 'quotes' : null;
      if (!fn) return sendJSON(res, 400, { error: '未知场景：' + scene });
      if (!pkg || !pkg.profile || !pkg.profile.vector) return sendJSON(res, 400, { error: '缺少有效的审美画像 pkg' });
      const data = Scenarios[fn](pkg, {});
      if (trial) data.trial = trial;
      return sendJSON(res, 200, data);
    } catch (e) { return sendJSON(res, 400, { error: String(e && e.message || e) }); }
  }

  // 游客试用余额查询（未登录时前端顶栏展示用）
  if (p === '/api/trial' && req.method === 'GET') {
    const u = getUserByToken(getTokenFromReq(req));
    if (u) return sendJSON(res, 200, { unlimited: true });
    return sendJSON(res, 200, loadTrial(clientIP(req), 'engine'));
  }

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 出图代理：密钥仅存于服务端（IMG_PROVIDER / OPENAI_API_KEY / JIMENG_API_KEY 等环境变量），前端不接触
  if (p === '/api/generate-image') {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    try {
      const body = JSON.parse(await readBody(req));
      const prompt = body && body.prompt;
      if (!prompt) return sendJSON(res, 400, { error: 'missing prompt' });
      // 登录用户按本人配额计费；未登录则走匿名锚点（IP 每日上限 + 全局共享池双层约束）
      const authUser = getUserByToken(getTokenFromReq(req));
      const userId = authUser ? authUser.id : ANON_USER;
      const isAdmin = !!(authUser && authUser.is_admin);
      // 匿名访客的 IP（用于「单 IP 每日出图上限」）；登录用户无需此维度
      const ip = authUser ? null : clientIP(req);
      // 匿名出图前置快检：单 IP 今日已到底，直接 429（立即返回，省一次真实 API 调用与一次轮询）
      if (!authUser) {
        const ipTrial = loadTrial(ip, 'image');
        if (ipTrial.remaining <= 0) {
          return sendJSON(res, 429, {
            error: `游客今日出图额度已用完（${ipTrial.used}/${ipTrial.limit} 张），登录后可用本人额度继续出图`,
            imgTrial: ipTrial, needLogin: true
          });
        }
      }
      // 改为异步任务：立即返回 jobId，前端轮询 /api/job/:id 取结果。
      // 长连接被网络抖动掐断不再是问题——任务在服务器后台跑完，恢复轮询即取结果。
      const job = createJob();
      enqueueGen(async () => {
        try {
          const q = loadQuota(userId, isAdmin);
          if (!isAdmin && q.used >= q.limit) { job.status = 'error'; job.needLogin = true; job.error = `额度已用尽（${q.used}/${q.limit}），登录后可用本人额度出图`; return; }
          // 双保险：任务内再次核验「单 IP 每日出图上限」
          if (!authUser) {
            const ipTrial = loadTrial(ip, 'image');
            if (ipTrial.remaining <= 0) { job.status = 'error'; job.needLogin = true; job.imgTrial = ipTrial; job.error = `游客今日出图额度已用完（${ipTrial.used}/${ipTrial.limit} 张），登录后可用本人额度出图`; return; }
          }
          const prov = require(path.join(STATIC_DIR, 'ai-aesthetic-engine', 'providers'));
          // 整体超时守卫：底层 provider 未按时返回也一定收尾，避免任务永久 pending
          const res2 = await Promise.race([
            prov.generateImage(prompt, (body && body.opts) || {}),
            new Promise((_, rej) => setTimeout(() => rej(new Error('出图超时（服务端守卫 4 分钟）')), 4 * 60 * 1000))
          ]);
          if (res2 && res2.image) { // 仅真正出图成功才消耗额度（降级/失败不计）
            addUsage(userId, 1);
            if (!authUser) addTrial(ip, 'image', 1); // 记匿名 per-IP 出图次数（登录用户不计 per-IP）
            res2.quota = loadQuota(userId);
            if (!authUser) res2.imgTrial = loadTrial(ip, 'image');
          }
          // 若落为本地 png，转 dataURL 便于前端直接展示；同时落一份到公开 share-images（s_ 前缀，匹配静态路由），
          // 返回 imageUrl 公网地址，供「图生视频特效」等需要云端可拉取图片 URL 的场景使用。
          if (res2.assetPath && fs.existsSync(res2.assetPath)) {
            const b64 = fs.readFileSync(res2.assetPath).toString('base64');
            res2.image = 'data:image/png;base64,' + b64;
            try {
              const pub = 's_' + crypto.randomBytes(9).toString('hex') + '.png';
              fs.copyFileSync(res2.assetPath, path.join(SHARE_IMG_DIR, pub));
              res2.imageUrl = '/share-images/' + pub;
            } catch (e) { /* 公开落盘失败不影响出图主流程 */ }
            delete res2.assetPath;
          }
          job.result = res2;
          job.status = 'done';
        } catch (e) { job.status = 'error'; job.error = String((e && e.message) || e); }
      });
      return sendJSON(res, 200, { jobId: job.id });
    } catch (e) { return sendJSON(res, 500, { error: String((e && e.message) || e) }); }
  }

  // 3D 神性雕塑生成（内置「3D模型与视频特效」技能 · 云端腾讯混元3D）：登录用户触发，服务器异步生成 GLB 落盘后返回公开 URL。无需用户自有 API key（鉴权令牌取自 .env 的 BUDDY_CLOUD_TOKEN）。
  if (p === '/api/3d/generate') {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    try {
      const me = getUserByToken(getTokenFromReq(req));
      if (!me) return sendJSON(res, 401, { error: '请先登录后再生成 3D 雕塑（3D 生成消耗较多算力）' });
      const body = JSON.parse(await readBody(req));
      const prompt = (body && body.prompt) || '';
      if (!prompt) return sendJSON(res, 400, { error: '缺少 prompt' });
      // 改为异步任务：立即返回 jobId，前端轮询 /api/job/:id 取结果（网络抖动只中断轮询，不丢任务）
      const id = 'm_' + crypto.randomBytes(9).toString('hex');
      const fileName = id + '.glb';
      const job = createJob();
      enqueue3D(async () => {
        try {
          const prov = require(path.join(STATIC_DIR, 'ai-aesthetic-engine', 'providers', 'buddycloud3d'));
          // 整体超时守卫：3D 生成较慢（专业版可能数分钟），务必返回而非无限挂起
          await Promise.race([
            prov.generate(prompt, Object.assign({ outDir: MODEL_DIR, fileName }, (body && body.opts) || {})),
            new Promise((_, rej) => setTimeout(() => rej(new Error('3D 生成超时（服务端守卫 8 分钟）')), 8 * 60 * 1000))
          ]);
          job.result = { ok: true, model_path: '/3d-models/' + fileName, url: '/3d-models/' + fileName };
          job.status = 'done';
        } catch (e) {
          const msg = String((e && e.message) || e);
          // 云端每日/并发配额耗尽：标记 429，前端据此提示更明确
          job.status = 'error';
          job.error = msg;
          job.code = /额度已用完|daily submit limit|daily limit|rate limit|too many requests/i.test(msg) ? 429 : 500;
        }
      });
      return sendJSON(res, 200, { jobId: job.id });
    } catch (e) { return sendJSON(res, 500, { error: String((e && e.message) || e) }); }
  }

  // 神性视频（文生视频，内置「图片视频生成」技能 · 云端腾讯混元视频）：登录用户触发，服务器生成视频落盘后返回公开 URL。
  // 无需用户自有 API key（鉴权令牌取自 .env 的 BUDDY_CLOUD_TOKEN，与 3D / 出图共用同一枚）。
  if (p === '/api/video/generate') {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    try {
      const me = getUserByToken(getTokenFromReq(req));
      if (!me) return sendJSON(res, 401, { error: '请先登录后再生成视频（视频生成消耗较多算力）' });
      const body = JSON.parse(await readBody(req));
      // 改为异步任务：立即返回 jobId，前端轮询 /api/job/:id 取结果（网络抖动只中断轮询，不丢任务）
      const job = createJob();
      enqueueVideo(async () => {
        try {
          const prompt = (body && body.prompt) || '';
          if (!prompt) throw new Error('缺少 prompt');
          const prov = require(path.join(STATIC_DIR, 'ai-aesthetic-engine', 'providers', 'buddycloudvideo'));
          const fileName = 'v_' + crypto.randomBytes(9).toString('hex') + '.mp4';
          // 视频生成较慢（文生视频 / 特效通常数十秒到数分钟），超时守卫放宽到 10 分钟
          const r = await Promise.race([
            prov.generate(prompt, { outDir: VIDEO_DIR, fileName }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('视频生成超时（服务端守卫 10 分钟）')), 10 * 60 * 1000))
          ]);
          job.result = { ok: true, video: r.video, url: r.url, type: r.type };
          job.status = 'done';
        } catch (e) {
          const msg = String((e && e.message) || e);
          // 云端每日/并发配额耗尽：标记 429，前端据此提示更明确
          job.status = 'error';
          job.error = msg;
          job.code = /额度已用完|daily submit limit|daily limit|rate limit|too many requests/i.test(msg) ? 429 : 500;
        }
      });
      return sendJSON(res, 200, { jobId: job.id });
    } catch (e) { return sendJSON(res, 500, { error: String((e && e.message) || e) }); }
  }

  // 异步生成任务结果轮询：前端提交生成后拿到 jobId，定时轮询此端点。
  // 网络抖动只中断轮询，任务在服务器后台跑完，恢复轮询后照取结果（根治长连接被掐断丢活）。
  const mJob = p.match(/^\/api\/job\/([A-Za-z0-9_]+)$/);
  if (mJob && req.method === 'GET') {
    const job = GEN_JOBS.get(mJob[1]);
    if (!job) return sendJSON(res, 404, { error: '任务不存在或已过期' });
    return sendJSON(res, 200, {
      id: job.id, status: job.status, progress: job.progress,
      result: job.result, error: job.error, code: job.code || null,
      needLogin: job.needLogin || false, imgTrial: job.imgTrial || null
    });
  }

  // 分享卡配图：公开可读的静态图片（存放在 backend/share-images，不在 STATIC_DIR 内，故单独走一条路由）
  // 文件名严格限定为「分享 id + 已知扩展名」，无法用它做目录穿越。
  const mShareImg = p.match(/^\/share-images\/(s_[A-Za-z0-9_]+\.(?:png|jpeg|webp))$/);
  if (mShareImg && req.method === 'GET') {
    const fp = path.join(SHARE_IMG_DIR, mShareImg[1]);
    if (!fs.existsSync(fp)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 内容随 id 不变，可长缓存
    return serveFile(fp, res);
  }

  // 分享卡 3D 雕塑：公开可读的 GLB/OBJ（存放在 backend/share-models，不在 STATIC_DIR 内，故单独走一条路由）
  const mShareModel = p.match(/^\/share-models\/(s_[A-Za-z0-9_]+\.(?:glb|obj|zip))$/);
  if (mShareModel && req.method === 'GET') {
    const fp = path.join(SHARE_MODEL_DIR, mShareModel[1]);
    if (!fs.existsSync(fp)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return serveFile(fp, res);
  }

  // 3D 雕塑（引擎页按需生成）：公开可读的 GLB/OBJ（存放在 backend/3d-models，不在 STATIC_DIR 内，单独走一条路由）
  const mModel = p.match(/^\/3d-models\/(m_[A-Za-z0-9_]+\.(?:glb|obj|zip))$/);
  if (mModel && req.method === 'GET') {
    const fp = path.join(MODEL_DIR, mModel[1]);
    if (!fs.existsSync(fp)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return serveFile(fp, res);
  }

  // 神性视频（引擎页按需生成）：公开可读的 MP4/MOV/WebM（存放在 backend/videos，单独走一条路由）
  const mVideo = p.match(/^\/videos\/(v_[A-Za-z0-9_]+\.(?:mp4|mov|webm))$/);
  if (mVideo && req.method === 'GET') {
    const fp = path.join(VIDEO_DIR, mVideo[1]);
    if (!fs.existsSync(fp)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return serveFile(fp, res);
  }

  // 分享页：带合法 id 时，把社交预览 meta 注入 <head> 后再返回（抓取器不执行 JS，见 buildShareMeta）
  // id 非法 / 分享不存在 / 文件读不到，一律安静退回普通静态处理，绝不因为预览而让页面打不开。
  if (req.method === 'GET' && /^\/(?:ai-aesthetic-engine\/)?share\.html$/.test(p)) {
    const sid = url.searchParams.get('id') || '';
    if (/^s_[A-Za-z0-9]{4,64}$/.test(sid)) {
      try {
        const row = db.prepare('SELECT id, title, data FROM shares WHERE id = ?').get(sid);
        if (row) {
          const fp = path.join(STATIC_DIR, 'ai-aesthetic-engine', 'share.html');
          let html = fs.readFileSync(fp, 'utf8');
          const meta = buildShareMeta(row, reqOrigin(req));
          html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escHTML(meta.title) + '</title>');
          html = html.replace(/<\/head>/i, meta.html + '</head>');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            // 每张卡的 meta 不同，且改标题后要能立刻生效，不做缓存
            'Cache-Control': 'no-cache'
          });
          res.end(html);
          return;
        }
      } catch (e) { /* 落空则继续走普通静态 */ }
    }
  }

  // 静态文件
  let rel = p;
  if (rel === '/') rel = '/index.html';
  // 禁止访问隐藏文件/目录（.DS_Store、.workbuddy 等）
  if (rel.split('/').filter(Boolean).some(s => s.charAt(0) === '.')) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  const filePath = path.normalize(path.join(STATIC_DIR, rel));
  if (!filePath.startsWith(path.normalize(STATIC_DIR))) { res.writeHead(403); res.end('forbidden'); return; }
  if (isProtectedPath(filePath)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('forbidden'); return; }
  // 管理后台：仅管理员可进入。已登录但非管理员的用户直接 403（不让页面 DOM 流出）；
  // 未登录放行，由前端登录门处理，避免管理员自己也无法登录。
  if (path.basename(rel) === 'admin.html') {
    const me = getUserByToken(getTokenFromReq(req));
    if (me && !me.is_admin) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 无权访问：当前账户不是管理员'); return;
    }
  }
  fs.stat(filePath, (err, st) => {
    // 目录请求（如 /ai-aesthetic-engine/）回退到该目录下的 index.html
    if (!err && st.isDirectory()) {
      const idx = path.join(filePath, 'index.html');
      fs.stat(idx, (e3, st3) => {
        if (e3 || !st3.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found: ' + rel); return; }
        serveFile(idx, res);
      });
      return;
    }
    if (err || !st.isFile()) {
      const alt = filePath + '.html';
      fs.stat(alt, (e2, st2) => {
        if (e2 || !st2.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found: ' + rel); return; }
        serveFile(alt, res);
      });
      return;
    }
    serveFile(filePath, res);
  });
});

// 端口被占是配置/残留进程问题，重启多少次都不会好：给出可执行的提示并退出，
// 别让通用 uncaughtException 兜底吞成一堆栈、再被看门狗反复拉起。
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用。可能是上一次的服务没停干净。');
    console.error('处理：sh start.sh stop  然后重试；或换端口 PORT=3001 sh start.sh');
    process.exit(1);
  }
  console.error('[server error]', e);
  process.exit(1);
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT + '/';
  console.log('AI-Aesthetic 后台已启动 → ' + url);
  console.log('  静态根目录 : ' + STATIC_DIR);
  console.log('  数据库文件 : ' + DB_FILE);
  console.log('  存储模式   : SQLite（跨设备 / 跨浏览器共享）');
  // 自动备份：data.db 此前是单点无备份，误删/损坏即全丢
  backup.init(db, {
    dir: process.env.BACKUP_DIR || path.join(__dirname, 'backups'),
    keep: parseInt(process.env.BACKUP_KEEP || '14', 10),
    intervalH: parseFloat(process.env.BACKUP_INTERVAL_H || '6'),
  });
  openBrowser(url);
});
