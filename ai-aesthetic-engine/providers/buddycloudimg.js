// 内置「图片视频生成」技能（云端腾讯混元生图）provider。
// 通过本地 buddy-cloud.py 的 image 子命令提交文生图任务，无需用户自己的任何 API key。
// 鉴权令牌取自 .env 的 BUDDY_CLOUD_TOKEN（与 3D 同一技能会话 JWT，约 60 天有效）。
//
// 自动续期设计（与 buddycloud3d.js 完全一致）：
//  - 令牌每次调用时实时从 .env（或 BUDDY_CLOUD_TOKEN_FILE 指向的独立文件）读取，
//    并带 mtime 缓存；续期时只需改写文件（rsync 到服务器即可），无需重启服务。
//  - 解出 JWT 的 exp：已过期则抛出清晰错误；临近过期（默认 14 天内）主动告警到日志。
//  - 真正的「续期动作」由 agent 侧的定时任务（automation）触发：重新 connect_cloud_service
//    取得新令牌并写回 .env / 令牌文件。
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PROVIDER_DIR = __dirname;
// 与 server.js 加载的是同一份 .env；实时读取以支持「改文件即生效」的免重启续期。
const ENV_PATH = path.join(PROVIDER_DIR, '..', '..', '问卷系统', 'backend', '.env');
// 可选：用独立令牌文件覆盖 .env（便于分离密钥管理与免重启刷新）。
const TOKEN_FILE = process.env.BUDDY_CLOUD_TOKEN_FILE || '';
const WARN_BEFORE_DAYS = Number(process.env.BUDDY_CLOUD_TOKEN_WARN_DAYS || 14);

let _tokenCache = { value: null, mtime: 0 };
let _warned = false;

function decodeJwtExp(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const buf = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const payload = JSON.parse(buf.toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch (e) { return null; }
}

// 实时读取令牌：优先独立令牌文件 → 其次实时 .env → 最后兜底 process.env（启动注入）。
function readToken() {
  if (TOKEN_FILE) {
    try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { /* fallthrough */ }
  }
  try {
    const st = fs.statSync(ENV_PATH);
    if (st.mtimeMs !== _tokenCache.mtime) {
      const txt = fs.readFileSync(ENV_PATH, 'utf8');
      const m = txt.match(/^BUDDY_CLOUD_TOKEN\s*=\s*(.+?)\s*$/m);
      _tokenCache = { value: m ? m[1].trim() : null, mtime: st.mtimeMs };
    }
    if (_tokenCache.value) return _tokenCache.value;
  } catch (e) { /* fallthrough */ }
  return (process.env.BUDDY_CLOUD_TOKEN || '').trim();
}

// 校验令牌有效期：过期抛清晰错误；临近过期写一次告警日志。
function checkToken(token) {
  const exp = decodeJwtExp(token);
  if (!exp) return; // 无法解析则交由云端判定
  const now = Math.floor(Date.now() / 1000);
  const leftDays = (exp - now) / 86400;
  if (exp <= now) {
    throw new Error('BUDDY_CLOUD_TOKEN 已过期，出图不可用。请重新运行 connect_cloud_service 获取新令牌并写入 BUDDY_CLOUD_TOKEN（.env 或令牌文件），无需重启服务。');
  }
  if (leftDays < WARN_BEFORE_DAYS && !_warned) {
    _warned = true;
    console.warn('[buddycloudimg] BUDDY_CLOUD_TOKEN 将在约 ' + leftDays.toFixed(1) + ' 天后过期，建议提前续期（重新获取令牌写入 .env / 令牌文件）。');
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const out = fs.createWriteStream(dest);
    lib.get(url, (res) => {
      if (res.statusCode !== 200) { out.close(); return reject(new Error('下载图片失败 HTTP ' + res.statusCode)); }
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
    }).on('error', (e) => { out.close(); reject(e); });
  });
}

function writeBase64(b64, dest) {
  return new Promise((resolve, reject) => {
    try { fs.writeFileSync(dest, Buffer.from(b64, 'base64')); resolve(dest); }
    catch (e) { reject(e); }
  });
}

// promptText: 文生图描述；opts: { outDir, fileName }
function generate(promptText, opts) {
  opts = opts || {};
  const token = readToken();
  if (!token) throw new Error('未配置 BUDDY_CLOUD_TOKEN（内置混元生图鉴权令牌）。请写入 backend/.env 或设置 BUDDY_CLOUD_TOKEN_FILE。');
  checkToken(token);
  if (!promptText) throw new Error('缺少 prompt');

  const outDir = opts.outDir || path.join(__dirname, '..', 'generated');
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = opts.fileName || ('img_' + crypto.randomBytes(9).toString('hex') + '.png');
  const outPath = path.join(outDir, fileName);

  const script = path.join(__dirname, 'buddy-cloud.py');
  // --revise 0：关闭自动改写，忠实还原我们精心构造的审美提示词；轮询上限 300s（出图一般 10–60s）。
  const args = ['image', promptText, '--revise', '0', '--token-stdin', '--max-poll-time', '300'];

  return new Promise((resolve, reject) => {
    const child = spawn('python3', [script].concat(args), { env: process.env });
    let stderr = '', stdout = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code !== 0) {
        let detail = '', authHint = '';
        try {
          const j = JSON.parse(stdout.trim());
          if (j && j.error) detail = '：' + j.error + (j.message ? (' ' + j.message) : '');
        } catch (e) { /* stdout 非 JSON */ }
        // 401 / 鉴权相关报错时，提示令牌可能过期或失效
        if (/401|expired|invalid|unauthor/i.test(stdout + stderr + detail)) {
          authHint = '\n（若提示鉴权失败，多半是 BUDDY_CLOUD_TOKEN 已过期或失效，请重新获取令牌。）';
        }
        return reject(new Error('生图脚本异常(code ' + code + ')' + detail + authHint +
          '\n[STDOUT] ' + stdout.slice(-500) + '\n[STDERR] ' + stderr.slice(-500)));
      }
      resolve(stdout);
    });
    child.stdin.write(token);
    child.stdin.end();
  }).then((stdout) => {
    let json;
    const m = stdout.trim().match(/\{[\s\S]*\}/);
    try { json = JSON.parse(m ? m[0] : stdout.trim()); }
    catch (e) { throw new Error('解析生图结果失败: ' + stdout.slice(-300)); }
    if (json.error) throw new Error(json.error + (json.message ? (': ' + json.message) : ''));

    // 取图片地址：优先 result_url（字符串/数组），其次 raw_result 内的 URL 字段，再其次 base64 / dataURL。
    let url = json.result_url;
    if (Array.isArray(url)) url = url[0];
    let b64 = null;
    if (!url && json.raw_result) {
      const rr = json.raw_result;
      url = rr.ResultUrl || rr.ResultImageUrl || rr.ResultImage;
      if (!url && rr.ResultImage && typeof rr.ResultImage === 'string' && !/^https?:/.test(rr.ResultImage)) {
        b64 = rr.ResultImage;
      }
    }
    if (!url && !b64) throw new Error('未找到生图结果（无 result_url / ResultImage）');

    if (b64) {
      return writeBase64(b64, outPath).then(() => ({
        image: outPath, assetPath: outPath, url: null, reason: '内置混元生图完成（base64 直写）'
      }));
    }
    if (typeof url === 'string' && url.startsWith('data:')) {
      const mm = url.match(/^data:image\/\w+;base64,(.+)$/);
      if (mm) return writeBase64(mm[1], outPath).then(() => ({
        image: outPath, assetPath: outPath, url: null, reason: '内置混元生图完成（dataURL 直写）'
      }));
    }
    return download(url, outPath).then(() => ({
      image: outPath, assetPath: outPath, url, reason: '内置混元生图完成'
    }));
  });
}

module.exports = { generate, _readToken: readToken, _decodeJwtExp: decodeJwtExp, _checkToken: checkToken };
