// providers.test.js · M2 出图通道（降级路径验证，不触碰真实网络）
const assert = require('assert');
const { generateImage } = require('./providers');
const { generatePackage } = require('./compose');
const Engine = require('./engine.js');

let pass = 0;
function ok(name, cond) { assert.ok(cond, '❌ ' + name); console.log('✅ ' + name); pass++; }

// 1. 无 provider 配置 → 优雅降级
(async () => {
  delete process.env.IMG_PROVIDER;
  const r1 = await generateImage('测试提示词', {});
  ok('无 IMG_PROVIDER → image:null + 降级原因', r1.image === null && /未配置/.test(r1.reason));

  // 2. 配置 openai 但缺 key → 调失败原因，不抛错、不阻塞
  process.env.IMG_PROVIDER = 'openai';
  delete process.env.OPENAI_API_KEY;
  const r2 = await generateImage('测试提示词', {});
  ok('openai 缺 key → image:null + 失败原因', r2.image === null && /OPENAI_API_KEY/.test(r2.reason));

  // 2b. 配置 jimeng 但缺 key → 调失败原因，不抛错、不阻塞
  process.env.IMG_PROVIDER = 'jimeng';
  delete process.env.JIMENG_API_KEY; delete process.env.ARK_API_KEY; delete process.env.VOLC_API_KEY;
  const r2b = await generateImage('测试提示词', {});
  ok('jimeng 缺 key → image:null + 失败原因', r2b.image === null && /JIMENG_API_KEY|ARK_API_KEY/.test(r2b.reason));

  // 2c. jimeng 模块可被 require（导出 generate），size 映射 '1024x1024'→'1K'
  const jimeng = require('./providers/jimeng.js');
  ok('jimeng 模块导出 generate 函数', typeof jimeng.generate === 'function');

  // 3. 未知 provider → 明确原因
  const r3 = await generateImage('测试提示词', { provider: 'does-not-exist' });
  ok('未知 provider → image:null + 未知原因', r3.image === null && /未知 provider/.test(r3.reason));

  // 4. 端到端编排：映射层(M1)完整，出图降级
  const demo = { e1: 2, e2: 3, e3: 3, e4: 2, e5: 2, j1: 2, j2: 2, j3: 1, j4: 3, j5: 1, as2: 0, am2: 0, aa2: 0, b1: 2, b2: 2, b3: 4, b4: 3, b5: 1 };
  const eng = Engine.run(demo, ['enneagram', 'jung', 'astro', 'bigfive'], { enneagram: 1, jung: 1, astro: 1, bigfive: 1 });
  const pkg = await generatePackage(eng, {});
  ok('编排层：M1 方案完整', pkg.imagePrompt.text.length > 0 && pkg.spaceStyle.text.length > 0);
  ok('编排层：generatedImage 降级为 null（无 key）', pkg.generatedImage && pkg.generatedImage.image === null);
  ok('编排层：降级带可读原因', typeof pkg.generatedImage.reason === 'string' && pkg.generatedImage.reason.length > 0);

  console.log('\n全部通过：' + pass + ' 项 ✅');
})().catch(e => { console.error('测试失败：', e); process.exit(1); });
