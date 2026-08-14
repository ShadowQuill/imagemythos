// providers/jimeng.js · 即梦 AI（火山引擎「视觉智能 Visual / CV」开放平台）文生图
// 官方文档（即梦图片生成4.0）：https://docs.volcengine.com/docs/85621/1863351
//
// 接入方式（火山通用 OpenAPI，SigV4 风格签名）：
//   接口地址 https://visual.volcengineapi.com，POST + application/json
//   Action/Version 拼到 URL query（仅作路由）；Authorization 鉴权放 HTTP Header（非 query）
//   固定 Scope：Region=cn-north-1，Service=cv
//   异步两步：CVSync2AsyncSubmitTask（拿 task_id）→ CVSync2AsyncGetResult（轮询取 image_urls）
//
// 即梦图片生成 4.0：req_key 固定为 't2i_v40_jimeng'；prompt 必选且 ≤800 字符。
// 签名派生初值用 "HMAC-SHA256"：kDate = HMAC-SHA256(SecretKey, dateStamp)。
//
// 密钥来源（按顺序）：opts.accessKeyId/secretAccessKey
//   → 环境变量 JIMENG_ACCESS_KEY / JIMENG_SECRET（backend/.env 约定）
//   → 兼容别名 JIMENG_ACCESS_KEY_ID / JIMENG_SECRET_ACCESS_KEY
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data, 'utf8').digest(); }

// 带超时的 fetch：防止网络不可达/挂起时无限等待（会导致调用方一直卡在"出图中…/生成中…"）
async function fetchWithTimeout(url, options = {}, ms = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 火山引擎签名（Header 场景）：Action/Version 拼在 query，鉴权放 Authorization 头
function signQuery({ method, url, body, ak, sk, region, service, action, version }) {
  const u = new URL(url);
  const host = u.host;
  const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, ''); // 20240801T123456Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  // query 仅 Action/Version（路由参数），并纳入签名规范
  const q = { Action: action, Version: version };
  const canonicalQuery = Object.keys(q).sort()
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');

  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders =
    'content-type:application/json\n' +
    'host:' + host + '\n' +
    'x-content-sha256:' + payloadHash + '\n' +
    'x-date:' + amzDate + '\n';
  // 注意 canonicalHeaders 末尾已有 \n，后面再补一个 \n => canonicalHeaders 与 signedHeaders 之间为空行（SigV4 规范）
  const canonicalRequest =
    method + '\n' + u.pathname + '\n' + canonicalQuery + '\n' +
    canonicalHeaders + '\n' + signedHeaders + '\n' + payloadHash;

  const scope = dateStamp + '/' + region + '/' + service + '/request';
  const stringToSign = 'HMAC-SHA256\n' + amzDate + '\n' + scope + '\n' + sha256Hex(canonicalRequest);

  // 火山通用派生初值：直接用 SecretKey 作为 HMAC key（kDate = HMAC-SHA256(sk, date)）
  const kDate = hmac(sk, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  const authorization =
    'HMAC-SHA256 Credential=' + ak + '/' + scope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  return {
    url: u.origin + u.pathname + '?' + canonicalQuery,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'X-Date': amzDate,
      'X-Content-Sha256': payloadHash
    }
  };
}

function resolveReqKey(opts) {
  return opts.reqKey || process.env.JIMENG_REQ_KEY || 't2i_v40_jimeng'; // 即梦图片生成 4.0
}

async function generate(promptText, opts) {
  opts = opts || {};
  const ak = opts.accessKeyId || process.env.JIMENG_ACCESS_KEY || process.env.JIMENG_ACCESS_KEY_ID;
  const sk = opts.secretAccessKey || process.env.JIMENG_SECRET || process.env.JIMENG_SECRET_ACCESS_KEY;
  if (!ak || !sk) {
    throw new Error('需设置 JIMENG_ACCESS_KEY + JIMENG_SECRET（即梦视觉 CV 服务；见 backend/.env）');
  }

  const baseURL = opts.baseURL || 'https://visual.volcengineapi.com';
  const region = opts.region || process.env.JIMENG_REGION || 'cn-north-1';
  const service = opts.service || process.env.JIMENG_SERVICE || 'cv';
  const reqKey = resolveReqKey(opts);
  const version = opts.version || '2022-08-31';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 即梦 4.0 限制 prompt ≤ 800 字符
  let prompt = promptText || '';
  let truncated = false;
  if (prompt.length > 800) { prompt = prompt.slice(0, 797) + '…'; truncated = true; }

  // 1) 提交任务
  const submitBody = JSON.stringify({ req_key: reqKey, prompt });
  const sub = signQuery({ method: 'POST', url: baseURL, body: submitBody, ak, sk, region, service, action: 'CVSync2AsyncSubmitTask', version });
  const subRes = await fetchWithTimeout(sub.url, { method: 'POST', headers: sub.headers, body: submitBody }, 30000);
  let subJson;
  if ((subRes.headers.get('content-type') || '').includes('application/json')) subJson = await subRes.json();
  else { const t = await subRes.text(); throw new Error('HTTP ' + subRes.status + ': ' + t.slice(0, 300)); }
  if (subRes.status !== 200) throw new Error('提交 HTTP ' + subRes.status + ': ' + JSON.stringify(subJson).slice(0, 300));
  if (subJson.code !== 10000) throw new Error('提交失败 code=' + subJson.code + ' msg=' + (subJson.message || JSON.stringify(subJson).slice(0, 200)));
  const taskId = subJson.data && subJson.data.task_id;
  if (!taskId) throw new Error('未返回 task_id: ' + JSON.stringify(subJson).slice(0, 200));

  // 2) 轮询结果（异步任务）。return_url 需放在查询时的 req_json 字符串里（即梦文档要求）
  const getBody = JSON.stringify({ req_key: reqKey, task_id: taskId, req_json: JSON.stringify({ return_url: true }) });
  let imageUrl = null, imageB64 = null;
  for (let i = 0; i < 40; i++) { // 最多 ~40*3s=120s
    await sleep(3000);
    const g = signQuery({ method: 'POST', url: baseURL, body: getBody, ak, sk, region, service, action: 'CVSync2AsyncGetResult', version });
    const gRes = await fetchWithTimeout(g.url, { method: 'POST', headers: g.headers, body: getBody }, 30000);
    let gJson;
    if ((gRes.headers.get('content-type') || '').includes('application/json')) gJson = await gRes.json();
    else { const t = await gRes.text(); throw new Error('查询 HTTP ' + gRes.status + ': ' + t.slice(0, 300)); }
    if (gRes.status !== 200) throw new Error('查询 HTTP ' + gRes.status + ': ' + JSON.stringify(gJson).slice(0, 300));
    if (gJson.code !== 10000) throw new Error('查询失败 code=' + gJson.code + ' msg=' + (gJson.message || JSON.stringify(gJson).slice(0, 200)));
    const d = gJson.data || {};
    const urls = d.image_urls || [];
    const b64 = d.binary_data_base64;
    if (d.status === 'done' || d.status === 'SUCCESS' || urls[0] || (b64 && String(b64).length > 10)) {
      imageUrl = urls[0] || null;
      imageB64 = (!imageUrl && b64) ? b64 : null;
      break;
    }
    if (d.status === 'failed' || d.status === 'expired') throw new Error('任务失败 status=' + d.status);
  }
  if (!imageUrl && !imageB64) throw new Error('轮询超时未出图（task_id=' + taskId + '）');

  // 3) 落地为本地 png（image_urls 下载 / binary_data_base64 直解码；后端会转 dataURL 展示）
  const dir = opts.outDir || path.join(__dirname, '..', 'generated');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'img_' + Date.now() + '.png');
  let buf;
  if (imageUrl) {
    const resp = await fetchWithTimeout(imageUrl, {}, 60000);
    buf = Buffer.from(await resp.arrayBuffer());
  } else {
    buf = Buffer.from(imageB64, 'base64');
  }
  fs.writeFileSync(fp, buf);
  return { image: fp, assetPath: fp, url: imageUrl, reason: '即梦(视觉cv)异步出图完成' + (truncated ? '（提示词已截断至800字）' : '') };
}

module.exports = { generate, signQuery, resolveReqKey };
