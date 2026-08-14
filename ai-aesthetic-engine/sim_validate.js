// 题库 v1 内部验证：引擎模拟试跑
const Engine = require('./engine.js');
const B = Engine.bank;

function randInt(n){ return Math.floor(Math.random()*n); }

// 构造某框架的随机作答（itemId -> 选项下标）
function randomAnswers(fwId){
  const fw = B.frameworks[fwId];
  const a = {};
  fw.items.forEach(it => { a[it.id] = randInt(it.options.length); });
  return a;
}

function fullRandom(){
  const a = {};
  ['enneagram','jung','astro','bigfive'].forEach(fw => Object.assign(a, randomAnswers(fw)));
  return a;
}

// ---- 1. 主/次分布与覆盖 ----
function distribution(fwId, N){
  const fw = B.frameworks[fwId];
  const keys = Object.keys(fw.results);
  const primCount = {}, secCount = {};
  let tie=0, nullPrim=0;
  for(let i=0;i<N;i++){
    const r = Engine.scoreFramework(randomAnswers(fwId), fwId);
    if(!r.primary) nullPrim++; else primCount[r.primary]=(primCount[r.primary]||0)+1;
    if(r.secondary) secCount[r.secondary]=(secCount[r.secondary]||0)+1;
    if(r.primary && r.primary===r.secondary) tie++;
  }
  const missing = keys.filter(k => !(k in primCount));
  return {primCount, secCount, tieRate: tie/N, nullPrimRate: nullPrim/N, missing};
}

// ---- 2. 占星 sign 三要素覆盖 ----
function astroSignCoverage(N){
  const signs = Object.keys(B.signs);
  const seen = {sun:new Set(), moon:new Set(), asc:new Set()};
  for(let i=0;i<N;i++){
    const r = Engine.scoreFramework(randomAnswers('astro'),'astro');
    ['sun','moon','asc'].forEach(a => { if(r._full && r._full[a]) seen[a].add(r._full[a]); });
  }
  return {
    sun: signs.filter(s=>seen.sun.has(s)).length,
    moon: signs.filter(s=>seen.moon.has(s)).length,
    asc: signs.filter(s=>seen.asc.has(s)).length,
    total: signs.length
  };
}

// ---- 3. aspect 加权行为校验 ----
function aspectWeightCheck(){
  // 取一个固定 astro 作答（让三要素解析到不同星座）
  const a = { as1:0, as2:0, as3:0, as4:0, as5:0, as6:0,        // sun -> aries
              am1:3, am2:3, am3:3, am4:3, am5:3, am6:3,         // moon -> pisces (am3+am6 双鱼权重0.6胜出)
              aa1:0, aa2:0, aa3:0, aa4:0, aa5:0, aa6:0 };       // asc -> aries
  const r = Engine.scoreFramework(a, 'astro');
  const vSun = Engine.vecFromResult('sun_' + r._full.sun);
  const vMoon = Engine.vecFromResult('moon_' + r._full.moon);
  const vAsc = Engine.vecFromResult('asc_' + r._full.asc);
  const meanOf = (...vs) => { const o={}; Engine.DIM_IDS.forEach(d=>{ o[d]=vs.reduce((s,v)=>s+(v[d]||0),0)/vs.length; }); return o; };

  const wEqual = {astro:{sun:1,moon:1,asc:1}};
  const wSunOnly = {astro:{sun:3,moon:0,asc:0}};
  const wDefault = {astro:{sun:1,moon:0.6,asc:0.4}};

  const vEq = Engine.mapToVector({astro:r}, ['astro'], {}, wEqual);
  const vSunOnly = Engine.mapToVector({astro:r}, ['astro'], {}, wSunOnly);
  const vDef = Engine.mapToVector({astro:r}, ['astro'], {}, wDefault);

  const maxDiff = (a,b)=>{ let m=0; Engine.DIM_IDS.forEach(d=>{ const diff=Math.abs((a[d]||0)-(b[d]||0)); if(diff>m)m=diff; }); return m; };
  const mean = {}; Engine.DIM_IDS.forEach(d=>{ mean[d]=((vSun[d]||0)+(vMoon[d]||0)+(vAsc[d]||0))/3; });
  const defExpected = {}; Engine.DIM_IDS.forEach(d=>{ defExpected[d]=((vSun[d]||0)*1+(vMoon[d]||0)*0.6+(vAsc[d]||0)*0.4)/2.0; });

  const eqOk = maxDiff(vEq, mean) < 1e-9;
  const sunOnlyOk = maxDiff(vSunOnly, vSun) < 1e-9;
  const defOk = maxDiff(vDef, defExpected) < 1e-9;
  return {r_full:r._full, eqOk, sunOnlyOk, defOk, eqDiff:maxDiff(vEq,mean), defDiff:maxDiff(vDef,defExpected)};
}

// ---- 4. 位置偏差探测（仅点某一固定选项）----
function positionalBias(optIdx){
  const fw='enneagram'; const a={};
  B.frameworks[fw].items.forEach(it=>{ a[it.id]=optIdx % it.options.length; });
  const r = Engine.scoreFramework(a, fw);
  const counts={}; B.frameworks[fw].items.forEach(it=>{ const s=it.options[optIdx%it.options.length].signals; for(const k in s) counts[k]=(counts[k]||0)+s[k]; });
  const top = Object.entries(counts).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,v])=>`型${k}:${v}`);
  return {primary:r.primary, top};
}

// ---- 5. 端到端随机 5000 次是否有退化(零向量) ----
function endToEndDegenerate(N){
  let zero=0, err=0;
  for(let i=0;i<N;i++){
    try{
      const out = Engine.run(fullRandom(), ['enneagram','jung','astro','bigfive'], {enneagram:1,jung:1,astro:1,bigfive:1});
      if(Engine.DIM_IDS.every(d=>Math.abs(out.vector[d])<1e-9)) zero++;
    }catch(e){ err++; }
  }
  return {zeroRate: zero/N, errRate: err/N};
}

const N=20000;
console.log('=== 1. 主/次分布与覆盖 (N='+N+') ===');
['enneagram','jung','astro'].forEach(fw=>{
  const d = distribution(fw, N);
  const fwObj=B.frameworks[fw];
  const kmiss = Object.keys(fwObj.results).filter(k=>!d.primCount[k]);
  console.log(`[${fwObj.name}] 平票率=${(d.tieRate*100).toFixed(2)}% 空主=${(d.nullPrimRate*100).toFixed(2)}% 未覆盖主结果=${kmiss.length?kmiss.join(','):'无'}`);
});

console.log('\n=== 2. 占星三要素 sign 覆盖 (N='+N+') ===');
const ac = astroSignCoverage(N);
console.log(`太阳覆盖 ${ac.sun}/${ac.total}, 月亮 ${ac.moon}/${ac.total}, 上升 ${ac.asc}/${ac.total}`);

console.log('\n=== 3. aspect 加权行为 ===');
const aw = aspectWeightCheck();
console.log('解析 _full =', JSON.stringify(aw.r_full));
console.log('等权→三要素均值:', aw.eqOk?'PASS':'FAIL', '(maxDiff='+aw.eqDiff+')');
console.log('太阳独大(权重3/0/0)→太阳向量:', aw.sunOnlyOk?'PASS':'FAIL');
console.log('默认权重(1/0.6/0.4)→归一化加权平均:', aw.defOk?'PASS':'FAIL', '(maxDiff='+aw.defDiff+')');

console.log('\n=== 4. 位置偏差探测（九型总选固定选项）===');
[0,1,2,3].forEach(o=>{ const p=positionalBias(o); console.log(`恒选选项${o}: 主=${p.primary} 累计信号Top3=${p.top.join(' ')}`); });

console.log('\n=== 5. 端到端退化检测 (N=5000) ===');
const e2e = endToEndDegenerate(5000);
console.log(`零向量率=${(e2e.zeroRate*100).toFixed(3)}% 报错率=${(e2e.errRate*100).toFixed(3)}%`);
