// 内置「图片视频生成」技能（云端腾讯混元视频）provider。
// 通过本地 buddy-cloud.py 的两个子命令提交视频任务，无需用户自己的任何 API key：
//   - video      ：文生视频（混元视频，默认 5 秒）
// 与 3D / 出图共用同一枚 BUDDY_CLOUD_TOKEN（技能会话 JWT，约 60 天有效）。
//
// 自动续期设计（与 buddycloud3d.js / buddycloudimg.js 完全一致）：
//  - 令牌每次调用时实时从 .env（或 BUDDY_CLOUD_TOKEN_FILE 指向的独立文件）读取，并带 mtime 缓存；
//    续期时只需改写文件（rsync 到服务器即可），无需重启服务。
//  - 解出 JWT 的 exp：已过期则抛出清晰错误；临近过期（默认 14 天内）主动告警到日志。
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
    throw new Error('BUDDY_CLOUD_TOKEN 已过期，视频生成不可用。请重新运行 connect_cloud_service 获取新令牌并写入 BUDDY_CLOUD_TOKEN（.env 或令牌文件），无需重启服务。');
  }
  if (leftDays < WARN_BEFORE_DAYS && !_warned) {
    _warned = true;
    console.warn('[buddycloudvideo] BUDDY_CLOUD_TOKEN 将在约 ' + leftDays.toFixed(1) + ' 天后过期，建议提前续期（重新获取令牌写入 .env / 令牌文件）。');
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const out = fs.createWriteStream(dest);
    lib.get(url, (res) => {
      if (res.statusCode !== 200) { out.close(); return reject(new Error('下载视频失败 HTTP ' + res.statusCode)); }
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
    }).on('error', (e) => { out.close(); reject(e); });
  });
}

// 取结果视频地址：优先 result_url（脚本 _format_output 统一输出），其次 raw_result 内的 URL 字段。
function extractVideoUrl(json) {
  let url = json.result_url;
  if (Array.isArray(url)) url = url[0];
  if (typeof url === 'string' && url) return url;
  if (json.raw_result) {
    const rr = json.raw_result;
    return rr.ResultVideoUrl || rr.ResultUrl || rr.VideoUrl || rr.result_url || null;
  }
  return null;
}

// 文生视频：promptText → 提交 video 子命令
function generate(promptText, opts) {
  return runJob('video', promptText, opts || {});
}

function runJob(mode, promptText, opts) {
  const token = readToken();
  if (!token) throw new Error('未配置 BUDDY_CLOUD_TOKEN（内置混元视频鉴权令牌）。请写入 backend/.env 或设置 BUDDY_CLOUD_TOKEN_FILE。');
  checkToken(token);

  const outDir = opts.outDir || path.join(__dirname, '..', 'videos');
  fs.mkdirSync(outDir, { recursive: true });
  // 注意：服务端路由已传入带 .mp4 后缀的 fileName（如 v_xxx.mp4），这里直接使用，避免重复后缀变成 .mp4.mp4
  const fileName = opts.fileName || ('v_' + crypto.randomBytes(9).toString('hex') + '.mp4');
  const outPath = path.join(outDir, fileName);

  const script = path.join(__dirname, 'buddy-cloud.py');
  let args;
  if (mode === 'video') {
    if (!promptText) throw new Error('缺少 prompt（文生视频需要文字描述）');
    // 文生视频较慢（通常数十秒到数分钟），轮询上限放宽到 600s。
    args = ['video', promptText, '--token-stdin', '--max-poll-time', '600'];
  } else {
    throw new Error('未知视频模式: ' + mode);
  }

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
        const blob = stdout + stderr + detail;
        // 每日/并发限频：云端维度配额耗尽，抛出友好提示，由 server 转 429
        if (/daily submit limit|daily limit|rate limit|too many requests|429/i.test(blob)) {
          return reject(new Error('今日视频生成额度已用完（云端每日上限已用尽）。请明天再试，或避免在调试时反复生成。'));
        }
        if (/401|expired|invalid|unauthor/i.test(blob)) {
          authHint = '\n（若提示鉴权失败，多半是 BUDDY_CLOUD_TOKEN 已过期或失效，请重新获取令牌。）';
        }
        return reject(new Error('视频生成脚本异常(code ' + code + ')' + detail + authHint +
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
    catch (e) { throw new Error('解析视频结果失败: ' + stdout.slice(-300)); }
    if (json.error) throw new Error(json.error + (json.message ? (': ' + json.message) : ''));

    const url = extractVideoUrl(json);
    if (!url) throw new Error('未找到视频结果（无 result_url / ResultVideoUrl）');

    return download(url, outPath).then(() => ({
      video: '/videos/' + fileName,
      url: '/videos/' + fileName,
      assetPath: outPath,
      type: mode
    }));
  });
}

module.exports = { generate, _readToken: readToken, _decodeJwtExp: decodeJwtExp, _checkToken: checkToken };
