// 生活场景应用引擎（生成层 M3）v0.1
// UMD：Node / 浏览器通用，零外部依赖、确定性、可单测。
// 输入：Generator.generate() 的整包 pkg（含 profile.vector / spaceStyle / imagePrompt）
// 输出：把同一份审美画像翻译成「可落地的生活场景建议」。
// 设计：本地确定性模板打底（离线、可复现，与 M1/M2 一致）；
//       可选 LLM 润色见 polishWithLLM()（未配置 key 时自动跳过，回退模板原文）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./generator'));
  } else {
    root.Scenarios = factory(root.Generator);
  }
}(typeof self !== 'undefined' ? self : this, function (Generator) {

  const VERSION = 'v0.1-mvp-m3';
  const DIM = Generator ? Generator.DIM_TABLE : null;
  const ENN = Generator ? Generator.ENNEAGRAM_MOTIF : null;
  const JUNG = Generator ? Generator.JUNG_MOTIF : null;

  // ───────────────────────── 单维侧解析 ─────────────────────────
  function sideOf(v) {
    if (v == null) return 'neu';
    if (v >= 0.15) return 'pos';
    if (v <= -0.15) return 'neg';
    return 'neu';
  }

  // 各维 → 房屋布局的具体建议（pos/neg/neu 三态）
  const HOUSE = {
    order: {
      pos:  { 排布: '对称、对齐、网格化陈列', 收纳: '开放有序的展示收纳，物品各归其位', 一句话: '以秩序感收束空间，减少视觉噪音' },
      neg:  { 排布: '流动错落、非对称、随性摆放', 收纳: '随性堆叠与开放层架，留白与杂乱共生', 一句话: '以松弛流动取代规整' },
      neu:  { 排布: '松弛而有节制的排布', 收纳: '半藏半露的折中收纳', 一句话: '秩序与自由之间取平衡' }
    },
    soft: {
      pos:  { 家具: '圆润边角、软包、绒面沙发', 质感: '雾感、温润触感', 一句话: '用曲线与柔软包裹身体' },
      neg:  { 家具: '尖角、金属切面、硬边家具', 质感: '锋利边界、硬光反射', 一句话: '以锐利线条制造张力' },
      neu:  { 家具: '柔中带刚的过渡造型', 质感: '中性触感', 一句话: '刚柔并济' }
    },
    warm: {
      pos:  { 色温: '暖光（2700–3000K）', 材质色: '木色、陶土、米杏等体温色', 一句话: '以暖光与体温色营造亲近' },
      neg:  { 色温: '冷白光（4000K+）', 材质色: '蓝灰、石材冷调', 一句话: '以冷调理性收束空间' },
      neu:  { 色温: '中性色温', 材质色: '中性灰米', 一句话: '平和中性' }
    },
    explicit: {
      pos:  { 色彩面积: '大面积亮色块、强对比墙', 装饰: '张扬的标识性单品作主视觉', 一句话: '让色彩与标识大胆出场' },
      neg:  { 色彩面积: '低饱和、小面积点缀', 装饰: '内敛退后的去标识装饰', 一句话: '以克制与留白为主' },
      neu:  { 色彩面积: '显隐得宜', 装饰: '均衡点缀', 一句话: '显隐均衡' }
    },
    natural: {
      pos:  { 材质: '木、麻、藤、植物等有机材质', 点缀: '绿植与天然纹理', 一句话: '引入自然本真' },
      neg:  { 材质: '塑料、合金、工业合成、霓虹', 点缀: '科技感装置', 一句话: '偏人工与科技质感' },
      neu:  { 材质: '自然与人工折中', 点缀: '少量绿植', 一句话: '古今调和' }
    },
    traditional: {
      pos:  { 元素: '纹样、陶器、经典传承物件', 线条: '古典比例与装饰线脚', 一句话: '以传统纹样沉淀时间感' },
      neg:  { 元素: '极简科技、参数化、未来感', 线条: '干净无装饰的现代线', 一句话: '以未来极简前瞻' },
      neu:  { 元素: '古今交融', 线条: '当代折中', 一句话: '当代语境' }
    },
    light: {
      pos:  { 体量: '薄纱、留白、浅色、通透悬浮', 层次: '轻盈通透少压迫', 一句话: '以轻盈留白释放空间' },
      neg:  { 体量: '石材、深重、层叠、沉实', 层次: '厚重层叠有压境感', 一句话: '以厚重沉实落地' },
      neu:  { 体量: '轻重相宜', 层次: '稳定', 一句话: '轻重平衡' }
    },
    sacred: {
      pos:  { 氛围: '静默、仪式感、对称穹顶感', 留白: '留白与光晕营造静穆角落', 一句话: '为生活留一处静穆仪式' },
      neg:  { 氛围: '市井烟火、实用热闹', 留白: '功能优先、烟火气', 一句话: '以烟火实用为主' },
      neu:  { 氛围: '日常中见微光', 留白: '平实', 一句话: '日常微光' }
    }
  };

  function pick(dimId, v) { return HOUSE[dimId][sideOf(v)]; }

  // ───────────────────────── 穿搭：各维 → 衣橱建议 ─────────────────────────
  const OUTFIT = {
    order: {
      pos:  { 廓形: '结构化、利落剪裁、线条清晰', 搭配: '成套呼应、秩序感配色', 一句话: '以结构与秩序塑造造型' },
      neg:  { 廓形: '层叠混搭、不对称、随性', 搭配: '自由叠穿、撞色实验', 一句话: '以混搭与随性表达自我' },
      neu:  { 廓形: '松弛有度的日常剪裁', 搭配: '折中混搭', 一句话: '在秩序与自由间取平衡' }
    },
    soft: {
      pos:  { 质感: '柔软垂坠、针织、绒感', 线条: '圆润弧形、流动', 一句话: '用柔软包裹身形' },
      neg:  { 质感: '硬挺皮革、金属配件', 线条: '锋利切线、挺括', 一句话: '以硬朗线条制造张力' },
      neu:  { 质感: '柔中带刚', 线条: '过渡造型', 一句话: '刚柔并济' }
    },
    warm: {
      pos:  { 色系: '暖调（米杏、焦糖、陶土、暖棕）', 一句话: '以暖色贴近体温' },
      neg:  { 色系: '冷调（雾蓝、灰、藏青、银）', 一句话: '以冷调保持理性距离' },
      neu:  { 色系: '中性灰米', 一句话: '平和中性' }
    },
    explicit: {
      pos:  { 存在感: '大胆色块、标识单品、强对比', 一句话: '让造型大胆出场' },
      neg:  { 存在感: '低饱和、去 logo、内敛退后', 一句话: '以克制低调为主' },
      neu:  { 存在感: '显隐得宜', 一句话: '显隐均衡' }
    },
    natural: {
      pos:  { 面料: '棉麻、丝、羊毛等天然材质', 一句话: '偏好天然材质' },
      neg:  { 面料: '科技面料、尼龙、合成革', 一句话: '偏好机能/科技材质' },
      neu:  { 面料: '天然与机能折中', 一句话: '折中' }
    },
    traditional: {
      pos:  { 元素: '经典廓形、纹样、复古细节', 一句话: '以经典沉淀风格' },
      neg:  { 元素: '未来感、机能、参数化剪裁', 一句话: '以前瞻极简表达' },
      neu:  { 元素: '当代折中', 一句话: '当代' }
    },
    light: {
      pos:  { 体量: '轻盈薄透、浅色、空气感', 一句话: '以轻盈释放身形' },
      neg:  { 体量: '厚重层叠、深重、量感', 一句话: '以量感落地造型' },
      neu:  { 体量: '轻重相宜', 一句话: '平衡' }
    },
    sacred: {
      pos:  { 气质: '静穆、仪式感、留白优雅', 一句话: '为造型留一份静穆' },
      neg:  { 气质: '烟火实用、街头感', 一句话: '以烟火街头为主' },
      neu:  { 气质: '日常微光', 一句话: '平实' }
    }
  };
  function pickO(dimId, v) { return OUTFIT[dimId][sideOf(v)]; }

  // 气质母题行（house/outfit/quotes 共用）
  function motifLineOf(pkg) {
    const enn = pkg.profile.primary && pkg.profile.primary.enneagram;
    const jung = pkg.profile.primary && pkg.profile.primary.jung;
    const ennM = enn ? ENN[enn] : null;
    const jungM = jung ? JUNG[jung] : null;
    return [ennM ? (ennM.holy + '·' + ennM.tone) : null, jungM ? jungM.tone : null]
      .filter(Boolean).join('，') || '中性气质';
  }
  // 取最强维度在指定侧（pos/neg）的"一句话"，用于语录拼句
  function strongestWord(v, side) {
    let best = null, bestAbs = 0.15;
    ['order', 'soft', 'warm', 'explicit', 'natural', 'traditional', 'light', 'sacred'].forEach(d => {
      const val = v[d] || 0;
      if (side === 'pos' && val > bestAbs) { best = d; bestAbs = val; }
      if (side === 'neg' && -val > bestAbs) { best = d; bestAbs = -val; }
    });
    if (!best) return side === 'pos' ? '克制' : '喧哗';
    return QUOTE_WORDS[best][side];
  }
  // 语录专用短短语（避免复用住房语境的"一句话"，更合诗性表达）
  const QUOTE_WORDS = {
    order:     { pos: '秩序与清晰', neg: '流动与自由' },
    soft:      { pos: '柔软与温润', neg: '锋利与张力' },
    warm:      { pos: '暖意与亲近', neg: '冷静与理性' },
    explicit:  { pos: '大胆与张扬', neg: '克制与内敛' },
    natural:   { pos: '自然与本真', neg: '机能与先锋' },
    traditional:{ pos: '经典与沉淀', neg: '未来与极简' },
    light:     { pos: '轻盈与通透', neg: '厚重与沉实' },
    sacred:    { pos: '静穆与仪式', neg: '烟火与实用' }
  };

  // 配色比例：依 explicit（显隐）与 light（轻重）侧推导主辅点缀占比
  function ratio(pkg) {
    const v = pkg.profile.vector;
    const sat = sideOf(v.explicit);
    const lgt = sideOf(v.light);
    if (sat === 'pos') return '主色约 60%（可大胆上墙/大面软装），辅色 30%，点缀 10%';
    if (sat === 'neg') return '主色约 70–80%（低饱和大面打底），辅色 15%，点缀 <5% 克制冷静';
    return '主色约 60%、辅色 30%、点缀 10%，显隐得宜';
  }

  // ───────────────────────── 房屋布局主函数 ─────────────────────────
  function houseLayout(pkg, opts) {
    opts = opts || {};
    if (!pkg || !pkg.profile || !pkg.profile.vector) {
      throw new Error('Scenarios.houseLayout: 需要 Generator.generate() 的整包 pkg');
    }
    const v = pkg.profile.vector;
    const palette = (pkg.spaceStyle && pkg.spaceStyle.palette) || {};
    const mood = pkg.profile.moodWords || [];

    // 气质母题（用于总纲与图提示词）
    const enn = pkg.profile.primary && pkg.profile.primary.enneagram;
    const jung = pkg.profile.primary && pkg.profile.primary.jung;
    const ennM = enn ? ENN[enn] : null;
    const jungM = jung ? JUNG[jung] : null;
    const motifLine = [ennM ? (ennM.holy + '·' + ennM.tone) : null, jungM ? jungM.tone : null]
      .filter(Boolean).join('，') || '中性气质';

    // 分项
    const materials = [pick('natural', v.natural).材质, pick('soft', v.soft).质感].join('；');
    const lighting = [pick('warm', v.warm).色温, pick('light', v.light).层次, pick('sacred', v.sacred).氛围].join('，');
    const furniture = [pick('soft', v.soft).家具, pick('order', v.order).排布, pick('light', v.light).体量].join('；');
    const atmosphere = [pick('sacred', v.sacred).氛围, pick('explicit', v.explicit).装饰, pick('traditional', v.traditional).元素].join('，');

    const paletteColor = (palette.hueTemp || '中性') + '调、' + (palette.saturation || '适中饱和') + '、' + (palette.lightness || '适中明度');
    const swatches = (palette.swatches && palette.swatches.length) ? '（参考色：' + palette.swatches.join('/') + '）' : '';

    const summary = '整体气质「' + motifLine + '」，空间走' + paletteColor + swatches +
      '；' + pick('sacred', v.sacred).一句话 + '，' + pick('order', v.order).一句话 + '。';

    // 分房间建议：取每个空间最相关的 2–3 个维度拼具体动作
    const rooms = [
      { name: '客厅（会客·展示）', dims: ['explicit', 'order', 'soft', 'natural'],
        extra: '作为风格主视觉区，' + pick('explicit', v.explicit).色彩面积 + '；' + pick('soft', v.soft).家具 + '。' },
      { name: '卧室（休憩）', dims: ['light', 'warm', 'sacred', 'soft'],
        extra: pick('warm', v.warm).色温 + '助眠；' + pick('light', v.light).体量 + '；' + pick('sacred', v.sacred).留白 + '。' },
      { name: '工作区 / 书房', dims: ['order', 'traditional', 'light', 'sacred'],
        extra: pick('order', v.order).收纳 + '；' + pick('traditional', v.traditional).线条 + '；' + pick('sacred', v.sacred).氛围 + '。' },
      { name: '餐厨 / 玄关', dims: ['natural', 'warm', 'explicit'],
        extra: pick('natural', v.natural).材质 + '；' + pick('warm', v.warm).色温 + '；' + pick('explicit', v.explicit).装饰 + '。' }
    ].map(r => {
      const tips = r.dims.map(d => pick(d, v[d]).一句话);
      tips.push(r.extra);
      return { name: r.name, tips: Array.from(new Set(tips)) };
    });

    // 避雷：取强维的"反侧"建议（不要做与之矛盾的事）
    const avoidParts = [];
    ['order', 'soft', 'warm', 'explicit', 'natural', 'traditional', 'light', 'sacred'].forEach(d => {
      if (Math.abs(v[d] || 0) >= 0.4) {
        const opp = sideOf(v[d]) === 'pos' ? HOUSE[d].neg : HOUSE[d].pos;
        avoidParts.push(opp.一句话);
      }
    });
    const avoid = avoidParts.length ? avoidParts.join('；') + '。' : '暂无强冲突，按中性舒适布置即可。';

    const base = {
      version: VERSION,
      summary,
      palette: { color: paletteColor + swatches, ratio: ratio(pkg) },
      materials,
      lighting,
      furniture,
      atmosphere,
      mood: mood.join('、'),
      rooms,
      avoid,
      imagePrompt: roomImagePrompt(pkg)
    };

    // 混合：可选 LLM 润色（未配置则原样返回）
    if (opts.polish) {
      return polishWithLLM(base, opts);
    }
    return base;
  }

  // 由 pkg 生成「房间实拍」出图提示词（可直接喂给 /api/generate-image）
  function roomImagePrompt(pkg) {
    const v = pkg.profile.vector;
    const ss = pkg.spaceStyle || {};
    const ip = (pkg.imagePrompt && pkg.imagePrompt.structured) || {};
    const palette = (ss.palette) || {};
    const color = (palette.hueTemp || '中性') + '调、' + (palette.saturation || '适中') + '、' + (palette.lightness || '适中');
    const materials = [pick('natural', v.natural).材质, pick('soft', v.soft).质感].join('，');
    const lighting = [pick('warm', v.warm).色温, pick('light', v.light).层次].join('，');
    const furniture = pick('soft', v.soft).家具 + '，' + pick('order', v.order).排布;
    const atmosphere = pick('sacred', v.sacred).氛围 + '，' + pick('explicit', v.explicit).装饰;
    const neg = ip.negative || '';
    return '室内设计实拍，' + (ss.text ? ss.text.split('（内部')[0] : '统一美学风格') +
      ' 的客厅与卧室空间，配色：' + color + '；材质：' + materials +
      '；光影：' + lighting + '；家具：' + furniture + '；氛围：' + atmosphere +
      '。真实摄影、自然光、8K、杂志风。' + (neg ? ' 避免：' + neg + '。' : '');
  }

  // 可选 LLM 润色钩子：配置 window.__LLM_POLISH（或 Node 端 opts.llm）后启用，
  // 否则直接回退模板原文（保证离线可用）。返回结构不变，仅文案更自然。
  async function polishWithLLM(base, opts) {
    const llm = (opts && opts.llm) || (typeof window !== 'undefined' ? window.__LLM_POLISH : null);
    if (typeof llm !== 'function') return base; // 未配置 → 回退模板
    try {
      const out = await llm(base);
      return Object.assign({}, base, out && out.text ? { summary: out.text } : {});
    } catch (e) {
      return base;
    }
  }

  // ───────────────────────── 穿搭衣橱 ─────────────────────────
  function outfit(pkg, opts) {
    opts = opts || {};
    if (!pkg || !pkg.profile || !pkg.profile.vector) {
      throw new Error('Scenarios.outfit: 需要 Generator.generate() 的整包 pkg');
    }
    const v = pkg.profile.vector;
    const palette = (pkg.spaceStyle && pkg.spaceStyle.palette) || {};
    const mood = pkg.profile.moodWords || [];
    const line = motifLineOf(pkg);
    const enn = pkg.profile.primary && pkg.profile.primary.enneagram;
    const ennM = enn ? ENN[enn] : null;
    const swatches = (palette.swatches && palette.swatches.length) ? '（参考色：' + palette.swatches.join('/') + '）' : '';

    const colorDesc = (palette.hueTemp || '中性') + '调、' + (palette.saturation || '适中饱和');
    const paletteText = '主色走' + colorDesc + swatches + '；辅色取同系深浅，点缀用' +
      (sideOf(v.explicit) === 'pos' ? '高对比亮色' : '低饱和同色') + '。';

    const silhouette = [pickO('soft', v.soft).线条, pickO('order', v.order).廓形, pickO('light', v.light).体量].join('；');
    const fabric = [pickO('natural', v.natural).面料, pickO('soft', v.soft).质感].join('；');
    const pattern = [pickO('explicit', v.explicit).存在感, pickO('traditional', v.traditional).元素].join('，');
    const hairMakeup = [pickO('warm', v.warm).色系, pickO('sacred', v.sacred).气质].join('，') + (mood.length ? '；整体气质：' + mood.join('、') : '');

    // 胶囊衣橱：由维度组合出具体单品建议
    const pieces = [
      '上装：' + pickO('soft', v.soft).质感 + '的' + pickO('order', v.order).廓形 + '单品（' + pickO('warm', v.warm).色系 + '）',
      '下装：' + pickO('light', v.light).体量 + '的' + pickO('order', v.order).廓形 + '裤/裙',
      '外套：' + pickO('natural', v.natural).面料 + '，' + pickO('explicit', v.explicit).存在感,
      '鞋包配饰：' + pickO('traditional', v.traditional).元素 + '，' + pickO('sacred', v.sacred).气质
    ];

    // 避雷
    const avoidParts = [];
    ['order', 'soft', 'warm', 'explicit', 'natural', 'traditional', 'light', 'sacred'].forEach(d => {
      if (Math.abs(v[d] || 0) >= 0.4) {
        const opp = sideOf(v[d]) === 'pos' ? OUTFIT[d].neg : OUTFIT[d].pos;
        avoidParts.push(opp.一句话);
      }
    });
    const avoid = avoidParts.length ? avoidParts.join('；') + '。' : '暂无强冲突，按中性舒适搭配即可。';

    const summary = '整体气质「' + line + '」的衣橱：' + pickO('soft', v.soft).一句话 + '，' +
      pickO('warm', v.warm).一句话 + '，' + pickO('explicit', v.explicit).一句话 + '。';

    const base = {
      version: VERSION,
      summary,
      palette: paletteText,
      silhouette,
      fabric,
      pattern,
      hairMakeup,
      mood: mood.join('、'),
      pieces,
      avoid,
      imagePrompt: outfitImagePrompt(pkg)
    };
    if (opts.polish) return polishWithLLM(base, opts);
    return base;
  }

  function outfitImagePrompt(pkg) {
    const v = pkg.profile.vector;
    const palette = (pkg.spaceStyle && pkg.spaceStyle.palette) || {};
    const color = (palette.hueTemp || '中性') + '调、' + (palette.saturation || '适中') + '、' + (palette.lightness || '适中');
    const silhouette = pickO('soft', v.soft).线条 + '，' + pickO('order', v.order).廓形;
    const fabric = pickO('natural', v.natural).面料 + '，' + pickO('soft', v.soft).质感;
    const vibe = pickO('sacred', v.sacred).气质 + '，' + pickO('explicit', v.explicit).存在感;
    return '时尚人像摄影，' + (pkg.profile.primary && pkg.profile.primary.enneagram ? (ENN[pkg.profile.primary.enneagram].holy + ' 气质') : '统一美学风格') +
      ' 的穿搭造型，配色：' + color + '；廓形：' + silhouette + '；面料：' + fabric + '；氛围：' + vibe +
      '。全身站姿、自然光、8K、杂志风、高清细节。';
  }

  // ───────────────────────── 思考语录 ─────────────────────────
  function quotes(pkg, opts) {
    opts = opts || {};
    if (!pkg || !pkg.profile || !pkg.profile.vector) {
      throw new Error('Scenarios.quotes: 需要 Generator.generate() 的整包 pkg');
    }
    const v = pkg.profile.vector;
    const mood = pkg.profile.moodWords || [];
    const line = motifLineOf(pkg);
    const enn = pkg.profile.primary && pkg.profile.primary.enneagram;
    const ennM = enn ? ENN[enn] : null;
    const symbol = ennM ? ennM.symbols[0] : '本真';
    const palette = (pkg.spaceStyle && pkg.spaceStyle.palette) || {};
    const color = (palette.hueTemp || '中性') + '调';
    const atmos = pick('sacred', v.sacred).氛围;
    const posW = strongestWord(v, 'pos');
    const negW = strongestWord(v, 'neg');
    const m1 = mood[0] || '克制';

    const lines = [
      '美于我，是一处' + atmos + '的' + symbol + '。',
      '我偏爱' + color + '里的' + m1 + '，而非喧哗。',
      line + '不是风格标签，是我与世界相处的方式。',
      '在' + negW + '之外，我更愿意守住' + posW + '。',
      '日常的仪式感，藏在' + pick('soft', v.soft).质感 + '与' + pick('natural', v.natural).材质 + '里。'
    ];

    const manifesto = '「' + line + '」——我的审美不是关于追逐流行，而是关于' + posW +
      '。它允许' + atmos + '，也容纳' + (mood.slice(1).join('、') || m1) + '。';

    const base = {
      version: VERSION,
      motif: line,
      mood: mood.join('、'),
      lines,
      today: lines[0],
      manifesto
    };
    if (opts.polish) return polishWithLLM(base, opts);
    return base;
  }

  return { houseLayout, roomImagePrompt, outfit, outfitImagePrompt, quotes, VERSION };
}));
