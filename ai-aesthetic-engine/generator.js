// 美学映射引擎（生成层核心 IP） v0.1 · M1
// UMD：Node / 浏览器通用，零外部依赖、确定性、可单测。
// 输入：engine.run() 的输出 { results, vector, explanation }
// 输出：整体美学方案整包 { profile, imagePrompt, spaceStyle, generatedImage:null }
//   —— M1 只做"映射 IP"，generatedImage 由 M2 的 providers 填充（缺 key 时为 null）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Generator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const VERSION = 'v0.1-mvp-m1';

  // ───────────────────────── 8 维视觉属性表（IP 本体） ─────────────────────────
  // 每维：pos/neg 端点描述 + 中性描述；side 决定符号，intensity=|val| 决定强度。
  const DIM_TABLE = {
    order: {
      posLabel: '秩序', negLabel: '混沌',
      pos: { desc: '规整几何、对称构图、网格化排布', mood: ['严谨', '安定'], kw: ['symmetrical', 'structured', 'geometric', 'orderly'] },
      neg: { desc: '流动泼洒、无序拼贴、失控留白', mood: ['自由', '野性'], kw: ['messy', 'scattered', 'random', 'chaotic'] },
      neu: '松弛而有节制的排布', neuMood: ['平衡']
    },
    soft: {
      posLabel: '柔', negLabel: '锐',
      pos: { desc: '曲线、绒面、雾感、圆润边角', mood: ['温润', '包容'], kw: ['soft', 'rounded', 'velvety', 'diffused'] },
      neg: { desc: '尖角、金属切面、硬光、锋利边界', mood: ['锋利', '张力'], kw: ['sharp', 'angular', 'metallic', 'hard-edged'] },
      neu: '柔中带刚的过渡质感', neuMood: ['中性']
    },
    warm: {
      posLabel: '暖', negLabel: '冷',
      pos: { desc: '橙红、木色、烛光、暖光', mood: ['亲近', '体温'], kw: ['warm', 'amber', 'candlelight', 'cozy'] },
      neg: { desc: '蓝灰、石材、冷光、硬光', mood: ['疏离', '理性'], kw: ['cool', 'blue-grey', 'cold-light', 'sterile'] },
      neu: '中性色温', neuMood: ['平和']
    },
    explicit: {
      posLabel: '显', negLabel: '隐',
      pos: { desc: '亮色块、大面积、强标识、张扬存在', mood: ['外放', '自信'], kw: ['bold', 'high-contrast', 'prominent', 'expressive'] },
      neg: { desc: '低饱和、小面积、去标识、内敛退后', mood: ['内敛', '克制'], kw: ['subtle', 'low-saturation', 'understated', 'minimal'] },
      neu: '显隐得宜', neuMood: ['均衡']
    },
    natural: {
      posLabel: '自然', negLabel: '人工',
      pos: { desc: '麻、木、植物、有机材质', mood: ['本真', '生机'], kw: ['organic', 'wood', 'linen', 'botanical'] },
      neg: { desc: '塑料、霓虹、合金、工业合成', mood: ['科技', '人造'], kw: ['plastic', 'neon', 'alloy', 'synthetic'] },
      neu: '自然与人工的折中', neuMood: ['调和']
    },
    traditional: {
      posLabel: '传统', negLabel: '未来',
      pos: { desc: '纹样、古籍、陶、经典传承', mood: ['沉淀', '经典'], kw: ['classical', 'ornate', 'heritage', 'timeless'] },
      neg: { desc: '极简科技、全息、参数化、未来感', mood: ['前瞻', '实验'], kw: ['futuristic', 'holographic', 'parametric', 'minimal-tech'] },
      neu: '古今交融', neuMood: ['当代']
    },
    light: {
      posLabel: '轻盈', negLabel: '厚重',
      pos: { desc: '薄纱、留白、浅色、通透悬浮', mood: ['轻松', '空灵'], kw: ['airy', 'translucent', 'whitespace', 'floating'] },
      neg: { desc: '石材、深重、层叠、沉实压境', mood: ['沉稳', '重量'], kw: ['heavy', 'stone', 'layered', 'grounded'] },
      neu: '轻重相宜', neuMood: ['稳定']
    },
    sacred: {
      posLabel: '神圣', negLabel: '世俗',
      pos: { desc: '光晕、对称穹顶、静默、仪式感', mood: ['超越', '静穆'], kw: ['halo', 'sanctuary', 'serene', 'ritual'] },
      neg: { desc: '市井、喧闹、实用、烟火气', mood: ['日常', '烟火'], kw: ['mundane', 'noisy', 'utilitarian', 'street'] },
      neu: '日常中见微光', neuMood: ['平实']
    }
  };
  const DIM_IDS = Object.keys(DIM_TABLE);

  // ───────────────────────── 类型 → 神性/原型 motif 层 ─────────────────────────
  // enneagram 主型 = 神性母题（anchor 层）；jung 主型 = 次级母题调制。
  const ENNEAGRAM_MOTIF = {
    '1': { holy: '神圣完美', symbols: ['通透秩序', '精准几何', '无瑕白', '克制留白'], tone: '洁净·严明' },
    '2': { holy: '神圣自由/意志', symbols: ['舒展姿态', '暖意联结', '开放空间', '柔光环抱'], tone: '温润·自在' },
    '3': { holy: '神圣希望/法则', symbols: ['上升线条', '明亮金属', '成就象征', '清晰结构'], tone: '昂扬·利落' },
    '4': { holy: '神圣本原/独特性', symbols: ['孤绝景致', '深色调', '独特纹理', '内省剪影'], tone: '独异·深沉' },
    '5': { holy: '神圣透明/全知', symbols: ['冷静蓝', '通透玻璃', '虚空背景', '理性几何'], tone: '清冷·通透' },
    '6': { holy: '神圣力量/信仰', symbols: ['稳固基石', '对称穹顶', '护持结构', '暖光庇护'], tone: '安稳·信赖' },
    '7': { holy: '神圣智慧/计划', symbols: ['繁盛色彩', '流动构图', '欢愉元素', '丰盈层次'], tone: '明快·丰盛' },
    '8': { holy: '神圣真理/正义', symbols: ['力量块面', '锐利边角', '厚重材质', '直面姿态'], tone: '刚毅·直接' },
    '9': { holy: '神圣爱/合一', symbols: ['柔和融合', '圆满环', '自然共生', '静谧光晕'], tone: '平和·圆融' }
  };
  const JUNG_MOTIF = {
    innocent:   { symbols: ['纯白', '乐园', '天真光', '简单形'], tone: '纯净·希望' },
    everyman:   { symbols: ['日常场景', '亲切质感', '朴实物件', '烟火气'], tone: '平实·亲和' },
    hero:       { symbols: ['挺立身姿', '凯旋弧线', '金色高光', '上升动势'], tone: '英勇·昂扬' },
    caregiver:  { symbols: ['环抱形', '暖巢', '柔软织物', '呵护光'], tone: '温暖·守护' },
    explorer:   { symbols: ['远方地平线', '开阔景', '未知路径', '清新空气'], tone: '自由·好奇' },
    rebel:      { symbols: ['破碎常规', '错位构', '挑衅色', '不规则'], tone: '反叛·张力' },
    lover:      { symbols: ['亲密双形', '玫瑰调', '柔焦', '缠绵线'], tone: '炽爱·柔美' },
    creator:    { symbols: ['从无生有', '工具与雏形', '原创形态', '灵感光'], tone: '创生·独特' },
    jester:     { symbols: ['戏谑错位', '明快撞色', '荒诞元素', '跳动形'], tone: '欢脱·玩笑' },
    sage:       { symbols: ['静默山水', '苍古石木', '内省留白', '智性蓝'], tone: '沉静·通达' },
    ruler:      { symbols: ['王座轴', '对称权杖', '庄重金', '秩序厅'], tone: '威严·有序' },
    magician:   { symbols: ['奇幻光效', '变形元素', '神秘符', '虚实交界'], tone: '神秘·转化' }
  };

  // ───────────────────────── 内部工具 ─────────────────────────
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // 单维解析：返回 {intensity(0..1), desc, mood[], kw[], side:'pos'|'neg'|'neu'}
  function blendDim(dimId, val) {
    const d = DIM_TABLE[dimId];
    if (val == null) val = 0;
    if (val >= 0.15) return { intensity: val, side: 'pos', desc: d.pos.desc, mood: d.pos.mood, kw: d.pos.kw };
    if (val <= -0.15) return { intensity: -val, side: 'neg', desc: d.neg.desc, mood: d.neg.mood, kw: d.neg.kw };
    return { intensity: 0, side: 'neu', desc: d.neu, mood: d.neuMood, kw: [] };
  }

  function strongDims(vector, thr) {
    thr = thr || 0.35;
    return DIM_IDS
      .filter(id => vector && Math.abs(vector[id] || 0) >= thr)
      .map(id => ({ id, val: vector[id], info: blendDim(id, vector[id]) }));
  }

  function uniq(arr) { return Array.from(new Set(arr)); }

  // ───────────────────────── 主生成函数 ─────────────────────────
  // engineOutput: { results, vector, explanation }
  // opts: { lang:'zh'|'en' } 当前实现 zh；en 预留。
  function generate(engineOutput, opts) {
    opts = opts || {};
    if (!engineOutput || !engineOutput.vector) {
      throw new Error('generator.generate: 需要 engine.run() 的输出（含 vector）');
    }
    const vector = engineOutput.vector;
    const results = engineOutput.results || {};

    // —— 主/次型提取（非占星框架的 primary 即类型 id）——
    const ennP = results.enneagram && results.enneagram.primary;
    const ennS = results.enneagram && results.enneagram.secondary;
    const jungP = results.jung && results.jung.primary;
    const jungS = results.jung && results.jung.secondary;
    const astroP = results.astro && results.astro.primary;
    const bfP = results.bigfive && results.bigfive.primary;

    const profile = {
      vector: Object.assign({}, vector),
      primary: { enneagram: ennP || null, jung: jungP || null, astro: astroP || null, bigfive: bfP || null },
      accent: { enneagram: ennS || null, jung: jungS || null },
      moodWords: []
    };

    // —— 逐维解析 ——
    const dim = {};
    DIM_IDS.forEach(id => { dim[id] = blendDim(id, vector[id]); });

    // —— 类型 motif 层 ——
    const ennMotif = ennP ? ENNEAGRAM_MOTIF[ennP] : null;
    const jungMotif = jungP ? JUNG_MOTIF[jungP] : null;

    // —— moodWords：强维情绪 + motif tone ——
    const moodWords = [];
    strongDims(vector).forEach(s => moodWords.push(...s.info.mood));
    if (ennMotif) moodWords.push(ennMotif.tone);
    if (jungMotif) moodWords.push(jungMotif.tone);
    profile.moodWords = uniq(moodWords);

    // —— 主体（subject）：神性母题 + 原型母题 ——
    const subjectParts = [];
    if (ennMotif) subjectParts.push(ennMotif.holy + '（' + ennMotif.symbols.slice(0, 2).join('、') + '）');
    if (jungMotif) subjectParts.push(jungMotif.symbols.slice(0, 2).join('、'));
    const subject = subjectParts.length ? subjectParts.join('，') : '中性气质主体';

    // —— 各表达维度拼接 ——
    const color = [dim.warm, dim.natural, dim.traditional].map(d => d.desc).join('，');
    const material = [dim.soft, dim.natural].map(d => d.desc).join('，');
    const light = [dim.warm, dim.light, dim.sacred].map(d => d.desc).join('，');
    const composition = [dim.order, dim.explicit, dim.light].map(d => d.desc).join('，');
    const atmosphere = [dim.sacred, dim.explicit].map(d => d.desc).join('，') +
      (profile.moodWords.length ? '；情绪：' + profile.moodWords.join('、') : '');

    // —— 负向提示词：取强维的"反侧"关键词，避免自相矛盾 ——
    const negativeKw = [];
    strongDims(vector, 0.4).forEach(s => {
      const opp = s.info.side === 'pos' ? DIM_TABLE[s.id].neg.kw : DIM_TABLE[s.id].pos.kw;
      negativeKw.push(...opp);
    });
    const negative = uniq(negativeKw).join(', ');

    // —— 影像文生图提示词 ——
    const imagePromptText =
      '主体：' + subject + '。' +
      '色彩：' + color + '。' +
      '材质：' + material + '。' +
      '光影：' + light + '。' +
      '构图：' + composition + '。' +
      '氛围：' + atmosphere + '。' +
      (negative ? '避免：' + negative + '。' : '') +
      '（内部验证版·无外部效度）';

    const imagePrompt = {
      structured: {
        subject,
        color: color,
        material: material,
        light: light,
        composition: composition,
        atmosphere: atmosphere,
        negative: negative
      },
      text: imagePromptText
    };

    // —— 空间 / 视觉风格方案 ——
    const swatches = uniq([
      dim.warm.kw[0], dim.natural.kw[0], dim.traditional.kw[0], dim.sacred.kw[0]
    ].filter(Boolean));
    const spaceStyle = {
      palette: {
        hueTemp: dim.warm.side === 'pos' ? '暖' : (dim.warm.side === 'neg' ? '冷' : '中性'),
        saturation: dim.explicit.side === 'pos' ? '高饱和/强对比' : (dim.explicit.side === 'neg' ? '低饱和/克制' : '适中'),
        lightness: dim.light.side === 'pos' ? '明亮通透' : (dim.light.side === 'neg' ? '深重沉实' : '适中'),
        swatches: swatches
      },
      materials: [dim.soft.desc, dim.natural.desc].join('；'),
      lighting: light,
      composition: composition,
      mood: profile.moodWords.join('、'),
      text:
        '整体气质：' + (ennMotif ? ennMotif.holy + '（' + ennMotif.tone + '）' : '中性') +
        (jungMotif ? '，叠合' + jungMotif.tone : '') + '。' +
        '配色走向' + (dim.warm.side === 'pos' ? '暖' : dim.warm.side === 'neg' ? '冷' : '中性') +
        '、' + (dim.explicit.side === 'pos' ? '高对比张扬' : dim.explicit.side === 'neg' ? '低饱和内敛' : '显隐得宜') + '；' +
        '材质以' + material + '为主；' +
        '光影' + light + '；' +
        '构图' + composition + '。' +
        (profile.moodWords.length ? '情绪基调：' + profile.moodWords.join('、') + '。' : '') +
        '（内部验证版·无外部效度）'
    };

    return {
      version: VERSION,
      profile,
      imagePrompt,
      spaceStyle,
      generatedImage: null // M2 由 providers 填充；缺 key 时保持 null
    };
  }

  return { generate, DIM_TABLE, DIM_IDS, ENNEAGRAM_MOTIF, JUNG_MOTIF, VERSION };
}));
