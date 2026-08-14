// generator.test.js · M1 映射 IP 单测（零依赖，仅 node assert）
// 运行：node generator.test.js
const assert = require('assert');
const G = require('./generator.js');
const Engine = require('./engine.js');

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, '❌ ' + name);
  console.log('✅ ' + name);
  pass++;
}

// ───────── 1. 单维插值正确性 ─────────
(function testBlend() {
  // 通过导出对象间接验证：generate 对强维应产出对应描述与负向词
  const out = G.generate({ vector: { order: 1, soft: 0, warm: 0, explicit: 0, natural: 0, traditional: 0, light: 0, sacred: 0 }, results: {} }, {});
  ok('order=+1 产出"对称/几何"描述', /对称|几何|网格/.test(out.imagePrompt.structured.composition));
  ok('order=+1 负向词含 chaotic 族', /chaotic|messy|scattered|random/.test(out.imagePrompt.structured.negative));
  const out2 = G.generate({ vector: { order: -1, soft: 0, warm: 0, explicit: 0, natural: 0, traditional: 0, light: 0, sacred: 0 }, results: {} }, {});
  ok('order=-1 产出"流动/混沌"描述', /流动|泼洒|拼贴|失控/.test(out2.imagePrompt.structured.composition));
  ok('order=-1 负向词含 orderly 族', /orderly|structured|symmetrical|geometric/.test(out2.imagePrompt.structured.negative));
  ok('中性向量无负向词', G.generate({ vector: { order: 0, soft: 0, warm: 0, explicit: 0, natural: 0, traditional: 0, light: 0, sacred: 0 }, results: {} }, {}).imagePrompt.structured.negative === '');
})();

// ───────── 2. 端到端：引擎输出 → 整体方案 ─────────
(function testEndToEnd() {
  const demo = { e1: 2, e2: 3, e3: 3, e4: 2, e5: 2, j1: 2, j2: 2, j3: 1, j4: 3, j5: 1, as2: 0, am2: 0, aa2: 0, b1: 2, b2: 2, b3: 4, b4: 3, b5: 1 };
  const eng = Engine.run(demo, ['enneagram', 'jung', 'astro', 'bigfive'], { enneagram: 1, jung: 1, astro: 1, bigfive: 1 });
  const pkg = G.generate(eng, {});

  ok('返回整体方案四段齐全', pkg.profile && pkg.imagePrompt && pkg.spaceStyle && 'generatedImage' in pkg);
  ok('generatedImage 为 null（M1 未接 API）', pkg.generatedImage === null);
  ok('imagePrompt.text 非空', typeof pkg.imagePrompt.text === 'string' && pkg.imagePrompt.text.length > 0);
  ok('spaceStyle.text 含"内部验证版"标注', /内部验证版/.test(pkg.spaceStyle.text));
  ok('imagePrompt.text 含"内部验证版"标注', /内部验证版/.test(pkg.imagePrompt.text));
  ok('profile 记录主型', pkg.profile.primary.enneagram && pkg.profile.primary.jung);
  ok('神性 motif 进入主体（含"神圣"）', /神圣/.test(pkg.imagePrompt.structured.subject));

  // 确定性：同输入两次结果一致
  const pkg2 = G.generate(eng, {});
  ok('确定性：同输入产出完全一致', JSON.stringify(pkg) === JSON.stringify(pkg2));
})();

// ───────── 3. 变异性：不同向量 → 不同方案 ─────────
(function testVariation() {
  const base = { results: { enneagram: { primary: '4' }, jung: { primary: 'sage' } } };
  const a = G.generate(Object.assign({ vector: { order: 0.9, soft: -0.8, warm: 0.7, explicit: 0.6, natural: 0.5, traditional: -0.4, light: 0.3, sacred: 0.8 } }, base), {});
  const b = G.generate(Object.assign({ vector: { order: -0.9, soft: 0.8, warm: -0.7, explicit: -0.6, natural: -0.5, traditional: 0.4, light: -0.3, sacred: -0.8 } }, base), {});
  ok('相反向量产出不同 imagePrompt', a.imagePrompt.text !== b.imagePrompt.text);
  ok('相反向量产出不同 spaceStyle', a.spaceStyle.text !== b.spaceStyle.text);
  ok('暖 vs 冷调 palette 不同', a.spaceStyle.palette.hueTemp !== b.spaceStyle.palette.hueTemp);
})();

// ───────── 4. 边界：无效输入抛错 ─────────
(function testErrors() {
  let threw = false;
  try { G.generate({ results: {} }, {}); } catch (e) { threw = true; }
  ok('缺少 vector 抛错', threw);
})();

console.log('\n全部通过：' + pass + ' 项 ✅');
