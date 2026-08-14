// providers/index.js · M2 出图通道（provider 抽象 + 优雅降级）
// 设计：映射 IP 永远可用；缺 provider/key 时 generateImage 返回 {image:null, reason}，不抛错、不阻塞。
// 新增 provider：在 providers/ 下加 <name>.js 导出 async generate(promptText, opts) 即可，自动被发现。
// 已内置：openai（OPENAI_API_KEY）、jimeng（JIMENG_ACCESS_KEY / JIMENG_SECRET，即梦视觉 CV）。
const path = require('path');

async function generateImage(promptText, opts) {
  opts = opts || {};
  const provider = opts.provider || process.env.IMG_PROVIDER || 'none';

  if (provider === 'none' || !provider) {
    return { provider: 'none', image: null, reason: 'IMG_PROVIDER 未配置（降级为仅方案，不出图）' };
  }

  let mod;
  try {
    mod = require(path.join(__dirname, provider + '.js'));
  } catch (e) {
    return { provider, image: null, reason: '未知 provider：' + provider + '（providers/' + provider + '.js 不存在）' };
  }

  try {
    const r = await mod.generate(promptText, opts);
    return {
      provider,
      image: r.image || null,
      url: r.url || null,
      assetPath: r.assetPath || null,
      seed: r.seed || null,
      reason: r.reason || null
    };
  } catch (e) {
    return { provider, image: null, reason: '调用失败：' + e.message };
  }
}

module.exports = { generateImage };
