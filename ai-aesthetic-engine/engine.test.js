// 引擎 v0.1 最小单测：node engine.test.js
const assert = require('assert');
const { scoreFramework, mapToVector, explain, run, vecFromResult, DIM_IDS, ACCENT_CAP } = require('./engine');

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + ' -> ' + e.message); failed++; }
}

// 1. 九型：构造作答使型4主、型9次（题库已扩至12题，每选项单主信号 w=1）
const eAns = { e1:3, e2:0, e3:3, e4:0, e5:1, e6:1, e7:3, e8:2, e9:1, e10:1, e11:2, e12:1 }; // 4:5分 ; 9:2分
const eRes = scoreFramework(eAns, 'enneagram');
check('九型产出主+次(型4主/型9次)', () => {
  assert.strictEqual(eRes.primary, '4');
  assert.strictEqual(eRes.secondary, '9');
});

// 2. 荣格：创造者主、英雄次
const jAns = { j1: 2, j2: 2, j3: 1, j4: 3, j5: 1 };
const jRes = scoreFramework(jAns, 'jung');
check('荣格产出主+次', () => {
  assert.ok(jRes.primary, '应有主结果');
  assert.ok(jRes.secondary, '应有次结果');
});

// 3. 占星：日月升各自出 sign，主=太阳、次=月亮（结构断言）
const aAns = { as1: 2, as2: 0, as3: 2, am1: 0, am2: 0, am3: 0, aa1: 0, aa2: 0, aa3: 0 };
const aRes = scoreFramework(aAns, 'astro');
check('占星日月升分流(主=太阳 次=月亮)', () => {
  assert.ok(aRes.primary && aRes.primary.startsWith('sun_'), '主应为太阳');
  assert.ok(aRes.secondary && aRes.secondary.startsWith('moon_'), '次应为月亮');
  assert.ok(aRes._full.sun, 'sun 应非空');
  assert.ok(aRes._full.moon, 'moon 应非空');
});

// 3b. 占星确定性：仅答一题即得到明确 sign（避免平票）
const aAns2 = { as2: 0 }; // 仅太阳题，选项0=leo
const aRes2 = scoreFramework(aAns2, 'astro');
check('占星单题即确定(太阳=leo)', () => {
  assert.strictEqual(aRes2._full.sun, 'leo');
  assert.strictEqual(aRes2._full.moon, null);
});

// 3c. 消平票：总分相同但出现题数更多者胜（gemini 两次 vs aries 一次，总分均为 1.0）
const aAns3 = { as4: 0, as1: 2, as5: 2 }; // aries{1.0,cnt1} vs gemini{1.0,cnt2}
const aRes3 = scoreFramework(aAns3, 'astro');
check('占星消平票(出现题数多者胜)', () => {
  assert.strictEqual(aRes3._full.sun, 'gemini');
});

// 3d. 占星全量作答确定性：日月升均非空，且两次结果一致
const fullAns = {
  as1:2, as2:0, as3:2, as4:1, as5:3, as6:0,
  am1:0, am2:1, am3:2, am4:3, am5:0, am6:1,
  aa1:3, aa2:2, aa3:1, aa4:0, aa5:3, aa6:2
};
const aFull1 = scoreFramework(fullAns, 'astro');
const aFull2 = scoreFramework(fullAns, 'astro');
check('占星全量作答日月升均确定且可复现', () => {
  ['sun','moon','asc'].forEach(a => {
    assert.ok(aFull1._full[a], a + ' 应非空');
    assert.strictEqual(aFull1._full[a], aFull2._full[a], a + ' 两次结果应一致');
  });
});

// 4. 大五：外向高
const bAns = { b1: 2, b2: 2, b3: 4, b4: 3, b5: 1 };
const bRes = scoreFramework(bAns, 'bigfive');
check('大五产出主+次', () => {
  assert.ok(bRes.primary && bRes.secondary);
});

// 5. mapToVector：向量在 [-1,1] 且无 NaN
const allRes = {
  enneagram: eRes, jung: jRes, astro: aRes, bigfive: bRes
};
const vec = mapToVector(allRes, ['enneagram', 'jung', 'astro', 'bigfive'], { enneagram: 1, jung: 1, astro: 1, bigfive: 1 });
check('向量取值均落在 [-1,1] 且无 NaN', () => {
  DIM_IDS.forEach(d => {
    assert.ok(!Number.isNaN(vec[d]), d + ' 为 NaN');
    assert.ok(vec[d] >= -1 && vec[d] <= 1, d + ' 越界: ' + vec[d]);
  });
});

// 6. 次维度点缀不淹没/反转主维度方向
check('次维度点缀上限生效(不反转主方向)', () => {
  // 用极端构造：主型8(锐/重/显/神)，次型2(暖)。order 维度主=0，次=0 不影响。
  const v8 = { primary: '8', secondary: '2' };
  const v = mapToVector({ f: v8 }, ['f'], { f: 1 });
  // 主型8 soft=-0.7, 次型2 soft 无 -> soft=-0.7；若次维度反向且超限才失败
  assert.ok(v.soft <= 0, '主型8应偏锐(soft<=0), 实际 ' + v.soft);
  DIM_IDS.forEach(d => assert.ok(Math.abs(v[d]) <= 1));
});

// 7. 可解释性返回字符串且含维度信息
const exp = explain(vec, allRes, ['enneagram', 'jung', 'astro', 'bigfive']);
check('explain 返回非空字符串', () => {
  assert.ok(typeof exp === 'string' && exp.length > 0);
});

// 8. 端到端 run 不抛错且输出结构完整
check('run 端到端产出 results/vector/explanation', () => {
  const out = run(bAns, ['enneagram', 'jung', 'astro', 'bigfive']);
  assert.ok(out.results && out.vector && out.explanation);
  DIM_IDS.forEach(d => assert.ok(out.vector[d] >= -1 && out.vector[d] <= 1));
});

// 9. 占星 aspect 权重纳入融合（取代固定「太阳=主/月亮=次/上升丢弃」）
const aspAns = { as1:2,as2:0,as3:2,as4:1,as5:3,as6:0, am1:0,am2:1,am3:2,am4:3,am5:0,am6:1, aa1:3,aa2:2,aa3:1,aa4:0,aa5:3,aa6:2 };
const aspRes = scoreFramework(aspAns, 'astro');
const DEF_AW = { astro: { sun: 1, moon: 0.6, asc: 0.4 } };
const vDefault = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, DEF_AW);
const vFlip   = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 0.3, moon: 0.4, asc: 1.0 } });
const vNoAsc  = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 1, moon: 0.6, asc: 0 } });

check('占星 aspect 权重改变融合结果', () => {
  const diff = DIM_IDS.filter(d => Math.abs(vDefault[d] - vFlip[d]) > 0.001);
  assert.ok(diff.length > 0, '翻转权重后向量应发生变化');
});

check('占星默认权重下「上升」也参与融合(非丢弃)', () => {
  const diff = DIM_IDS.filter(d => Math.abs(vDefault[d] - vNoAsc[d]) > 0.001);
  assert.ok(diff.length > 0, '将上升权重置 0 后向量应变化，说明默认下上升有贡献');
});

check('占星 aspect 融合向量取值合法', () => {
  DIM_IDS.forEach(d => {
    assert.ok(!Number.isNaN(vDefault[d]), d + ' 为 NaN');
    assert.ok(vDefault[d] >= -1 && vDefault[d] <= 1, d + ' 越界: ' + vDefault[d]);
  });
});

check('占星 aspect 权重缺省时回退题库默认', () => {
  // 不传 aspectWeights，应自动使用题库 aspectWeights，且不抛错、结果合法
  const v = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 });
  DIM_IDS.forEach(d => {
    assert.ok(!Number.isNaN(v[d]));
    assert.ok(v[d] >= -1 && v[d] <= 1);
  });
});

check('占星结果携带 _aspectWeights 并影响主/次推导', () => {
  assert.ok(aspRes._aspectWeights, '应携带 aspectWeights');
  assert.ok(aspRes.primary && aspRes.primary.startsWith('sun_'), '默认权重下太阳应为主');
});

// 9b. 直观加权：单要素权重=1、其余=0 时，融合向量等于该要素向量
const sunVec = vecFromResult('sun_' + aspRes._full.sun);
const vSunOnly = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 1, moon: 0, asc: 0 } });
check('占星权重直观(单要素=该要素向量)', () => {
  DIM_IDS.forEach(d => assert.ok(Math.abs(vSunOnly[d] - sunVec[d]) < 1e-9, d + ' 应精确等于太阳向量'));
});

// 9c. 直观加权：等权两要素 = 二者均值（太阳=1、月亮=1、上升=0）
const moonVec = vecFromResult('moon_' + aspRes._full.moon);
const vEq = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 1, moon: 1, asc: 0 } });
check('占星权重直观(等权两要素=均值)', () => {
  DIM_IDS.forEach(d => {
    const exp = 0.5 * (sunVec[d] + moonVec[d]);
    assert.ok(Math.abs(vEq[d] - exp) < 1e-9, d + ' 应等于太阳+月亮均值, got ' + vEq[d] + ' exp ' + exp);
  });
});

// 9d. 直观加权：权重按比例缩放向量（上升 1.0 vs 0.4 时，上升要素贡献应成比例）
const vAscHi = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 1, moon: 0.6, asc: 1.0 } });
const vAscLo = mapToVector({ astro: aspRes }, ['astro'], { astro: 1 }, { astro: { sun: 1, moon: 0.6, asc: 0.4 } });
const ascVec = vecFromResult('asc_' + aspRes._full.asc);
check('占星权重直观(上升权重升高使向量更靠近上升向量)', () => {
  // 上升要素在向量中的占比应随权重上升而增大：比较 (vAscHi - vSunOnly) 与 (vAscLo - vSunOnly) 的上升方向投影
  let hiProj = 0, loProj = 0;
  DIM_IDS.forEach(d => {
    if (ascVec[d]) {
      hiProj += (vAscHi[d] - vSunOnly[d]) * Math.sign(ascVec[d]);
      loProj += (vAscLo[d] - vSunOnly[d]) * Math.sign(ascVec[d]);
    }
  });
  assert.ok(hiProj > loProj, '上升权重升高应使向量更靠近上升向量 (hiProj=' + hiProj.toFixed(3) + ' > loProj=' + loProj.toFixed(3) + ')');
});

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
