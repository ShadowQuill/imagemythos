// 美学语义引擎 v0.1（UMD：Node / 浏览器通用）
// Node：自动从同目录 questionBank.json / dimensions.json 加载（保持 engine.test.js 兼容）
// 浏览器：读取全局 window.AESTHETIC_DATA = { bank, dims }
// 融合规则：主维度定调(anchor)，次维度点缀权重(accent, 上限 ACCENT_CAP)，不整体平移。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const fs = require('fs');
    const path = require('path');
    const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'questionBank.json'), 'utf8'));
    const dimsDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'dimensions.json'), 'utf8'));
    const api = factory(bank, dimsDoc);
    if (require.main === module) runDemo(api);
    module.exports = api;
  } else {
    const d = (root.AESTHETIC_DATA || {});
    root.Engine = factory(d.bank, d.dims);
  }
}(typeof self !== 'undefined' ? self : this, function (bank, dimsDoc) {

  const DIM_IDS = dimsDoc.dimensions.map(d => d.id);
  const DIM_MAP = Object.fromEntries(dimsDoc.dimensions.map(d => [d.id, d]));
  const ACCENT_CAP = 0.2; // 次维度点缀权重上限

  // 占星：从结果中取某 aspect 的星座向量（无则返回 null）
  function astroAspectVec(r, asp) {
    const sign = r && r._full && r._full[asp];
    if (!sign) return null;
    return vecFromResult(asp + '_' + sign);
  }

  // 解析 aspect 权重：运行时传入 > 结果自带 > 题库默认
  function resolveAspectWeights(fwId, r, runtimeAW) {
    if (runtimeAW && runtimeAW[fwId]) return runtimeAW[fwId];
    if (r && r._aspectWeights) return r._aspectWeights;
    const fw = bank.frameworks[fwId];
    if (fw && fw.aspectWeights) return fw.aspectWeights;
    return null;
  }

  function zeroVec() { const v = {}; DIM_IDS.forEach(d => v[d] = 0); return v; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // 把结果 key 解析成维度向量
  function vecFromResult(resultKey) {
    if (!resultKey) return zeroVec();
    for (const fw of Object.values(bank.frameworks)) {
      if (fw.results && fw.results[resultKey] && fw.results[resultKey].vector) {
        const v = zeroVec();
        Object.assign(v, fw.results[resultKey].vector);
        return v;
      }
    }
    const m = resultKey.match(/^(sun|moon|asc)_(.+)$/);
    if (m && bank.signs[m[2]]) {
      const v = zeroVec();
      Object.assign(v, bank.signs[m[2]].vector);
      return v;
    }
    return zeroVec();
  }

  // 单个框架计分 -> {primary, secondary}
  function scoreFramework(answers, fwId) {
    const fw = bank.frameworks[fwId];
    if (!fw) throw new Error('unknown framework: ' + fwId);

    if (fwId === 'astro') {
      const aspects = ['sun', 'moon', 'asc'];
      // 每个 aspect 维护 { sign: {w 总分, cnt 出现题数, max 单题最高权重} }
      const tally = { sun: {}, moon: {}, asc: {} };
      fw.items.forEach(it => {
        const optIdx = answers[it.id];
        if (optIdx == null) return;
        const sig = it.options[optIdx].signals;
        const asp = it.aspect;
        for (const k in sig) {
          const w = sig[k];
          const t = (tally[asp][k] = tally[asp][k] || { w: 0, cnt: 0, max: 0 });
          t.w += w; t.cnt += 1; if (w > t.max) t.max = w;
        }
      });
      // 固定星座序，作为最终确定性兜底，彻底消除平票歧义
      const SIGN_ORDER = Object.keys(bank.signs);
      const res = {};
      aspects.forEach(asp => {
        const entries = Object.entries(tally[asp]);
        if (!entries.length) { res[asp] = null; return; }
        entries.sort((a, b) => {
          const A = a[1], B = b[1];
          if (B.w !== A.w) return B.w - A.w;                       // 1) 总分高
          if (B.cnt !== A.cnt) return B.cnt - A.cnt;               // 2) 出现题数多
          if (B.max !== A.max) return B.max - A.max;              // 3) 单题最高权重高
          return SIGN_ORDER.indexOf(a[0]) - SIGN_ORDER.indexOf(b[0]); // 4) 固定序
        });
        res[asp] = entries[0][0];
      });
      const aw = (bank.frameworks.astro.aspectWeights) || { sun: 1, moon: 0.6, asc: 0.4 };
      const present = aspects.filter(a => res[a]);
      const byWeight = present.slice().sort((a, b) => (aw[b] || 0) - (aw[a] || 0));
      return {
        primary: byWeight[0] ? byWeight[0] + '_' + res[byWeight[0]] : null,
        secondary: byWeight[1] ? byWeight[1] + '_' + res[byWeight[1]] : null,
        _full: res,
        _aspectWeights: aw
      };
    }

    const tally = {};
    fw.items.forEach(it => {
      const optIdx = answers[it.id];
      if (optIdx == null) return;
      const sig = it.options[optIdx].signals;
      for (const k in sig) tally[k] = (tally[k] || 0) + sig[k];
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    return {
      primary: sorted[0] ? sorted[0][0] : null,
      secondary: sorted[1] ? sorted[1][0] : null,
      _scores: tally
    };
  }

  // 多个框架结果 -> 统一美学向量
  // 融合规则：主维度定调(anchor, factor=1)，次维度点缀权重(accent, 上限 ACCENT_CAP)，不整体平移。
  // 占星：三要素(日月升)各自带权重，按"归一化加权平均"融合 —— 权重直接决定各要素在最终美学向量
  //       中的占比，滑动权重即可感，取代原先"相对权重*ACCENT_CAP(0.2上限)"的点缀写法。
  function mapToVector(frameworkResults, selected, weights, aspectWeights) {
    selected = selected || Object.keys(frameworkResults);
    weights = weights || {};
    aspectWeights = aspectWeights || {};
    const acc = zeroVec();
    let wsum = 0;
    selected.forEach(fwId => {
      const r = frameworkResults[fwId];
      if (!r) return;
      const w = weights[fwId] || 1;
      wsum += w;
      const contribs = []; // [{vec, factor}]
      if (fwId === 'astro') {
        const aw = resolveAspectWeights('astro', r, aspectWeights);
        if (aw) {
          const present = ['sun', 'moon', 'asc'].filter(a => r._full && r._full[a]);
          if (present.length) {
            // 直观加权：三要素向量按各自权重归一化加权平均
            // 权重直接决定各要素占比，滑杆调节即时可感
            const sumW = present.reduce((s, a) => s + (aw[a] || 0), 0) || 1;
            const aVec = zeroVec();
            present.forEach(a => {
              const v = astroAspectVec(r, a);
              if (!v) return;
              const ww = (aw[a] || 0) / sumW;
              DIM_IDS.forEach(d => { if (v[d]) aVec[d] += v[d] * ww; });
            });
            contribs.push({ vec: aVec, factor: 1 });
          }
        }
      }
      if (!contribs.length) {
        const anchor = vecFromResult(r.primary);
        contribs.push({ vec: anchor, factor: 1 });
        if (r.secondary) {
          const accent = vecFromResult(r.secondary);
          contribs.push({ vec: accent, factor: ACCENT_CAP });
        }
      }
      DIM_IDS.forEach(d => {
        let c = 0;
        contribs.forEach(cn => { if (cn.vec[d]) c += cn.vec[d] * cn.factor; });
        acc[d] += w * c;
      });
    });
    const out = zeroVec();
    DIM_IDS.forEach(d => { out[d] = wsum ? clamp(acc[d] / wsum, -1, 1) : 0; });
    return out;
  }

  // 可解释性输出
  function explain(vector, frameworkResults, selected, weights, aspectWeights) {
    selected = selected || Object.keys(frameworkResults);
    const lines = [];
    const drivers = {};
    selected.forEach(fwId => {
      const r = frameworkResults[fwId];
      if (!r) return;
      const vecs = [];
      if (fwId === 'astro') {
        ['sun', 'moon', 'asc'].forEach(a => { const v = astroAspectVec(r, a); if (v) vecs.push(v); });
      } else if (r.primary) {
        vecs.push(vecFromResult(r.primary));
      }
      vecs.forEach(v => {
        DIM_IDS.forEach(d => {
          if (v[d] && Math.abs(v[d]) >= 0.4 && Math.sign(v[d]) === Math.sign(vector[d])) {
            (drivers[d] = drivers[d] || []).push({ fw: fwId, mag: Math.abs(v[d]) });
          }
        });
      });
    });
    DIM_IDS.forEach(d => {
      const val = vector[d];
      if (Math.abs(val) < 0.35) return;
      const side = val > 0 ? DIM_MAP[d].posLabel : DIM_MAP[d].negLabel;
      const srcs = (drivers[d] || [])
        .sort((a, b) => b.mag - a.mag)
        .map(s => bank.frameworks[s.fw].name)
        .filter((v, i, a) => a.indexOf(v) === i);
      const srcTxt = srcs.length ? '（主要受：' + srcs.join('、') + '）' : '';
      lines.push(`· ${side}（${(val >= 0 ? '+' : '') + val.toFixed(2)}）${srcTxt}`);
    });
    return lines.length ? lines.join('\n') : '· 各维度均接近中性，气质信号较弱。';
  }

  // 端到端：作答 -> 向量 + 解释
  function run(answers, selected, weights, aspectWeights) {
    const results = {};
    Object.keys(bank.frameworks).forEach(fwId => {
      results[fwId] = scoreFramework(answers, fwId);
    });
    const vec = mapToVector(results, selected, weights, aspectWeights);
    return {
      results,
      vector: vec,
      explanation: explain(vec, results, selected, weights, aspectWeights)
    };
  }

  return { scoreFramework, mapToVector, explain, run, vecFromResult, DIM_IDS, ACCENT_CAP, bank };
}));

// Node 直跑演示
function runDemo(api) {
  const demo = {
    e1: 2, e2: 3, e3: 3, e4: 2, e5: 2,
    j1: 2, j2: 2, j3: 1, j4: 3, j5: 1,
    as2: 0, am2: 0, aa2: 0,
    b1: 2, b2: 2, b3: 4, b4: 3, b5: 1
  };
  const out = api.run(demo, ['enneagram', 'jung', 'astro', 'bigfive'], { enneagram: 1, jung: 1, astro: 1, bigfive: 1 });
  console.log('主/次结果：');
  Object.entries(out.results).forEach(([k, r]) => console.log('  ' + api.bank.frameworks[k].name + ':', '主=' + r.primary, '次=' + r.secondary));
  console.log('\n统一美学向量：');
  api.DIM_IDS.forEach(d => console.log('  ' + d + ': ' + out.vector[d].toFixed(2)));
  console.log('\n解释：\n' + out.explanation);
}
