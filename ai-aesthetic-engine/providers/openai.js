// providers/openai.js · OpenAI 文生图（零依赖，使用 Node 全局 fetch；Node ≥ 18）
// 支持 gpt-image-1（返回 b64_json，落地为本地 png）与 dall-e-3（返回 url）。
// 密钥：opts.apiKey 或环境变量 OPENAI_API_KEY。
const fs = require('fs');
const path = require('path');

async function generate(promptText, opts) {
  opts = opts || {};
  const key = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY 未设置');

  const model = opts.model || 'gpt-image-1';
  const size = opts.size || '1024x1024';
  const body = { model, prompt: promptText, n: 1, size };

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300));
  }
  const j = await res.json();
  const item = j && j.data && j.data[0];
  if (!item) throw new Error('响应中无图像数据');

  // gpt-image-1 返回 b64_json
  if (item.b64_json) {
    const dir = opts.outDir || path.join(__dirname, '..', 'generated');
    fs.mkdirSync(dir, { recursive: true });
    const fn = 'img_' + Date.now() + '.png';
    const fp = path.join(dir, fn);
    fs.writeFileSync(fp, Buffer.from(item.b64_json, 'base64'));
    return { image: fp, assetPath: fp, reason: '已落地为本地 png' };
  }
  // dall-e-3 返回 url
  if (item.url) return { image: item.url, url: item.url };
  throw new Error('无法解析返回结果');
}

module.exports = { generate };
