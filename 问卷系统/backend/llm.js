// llm.js · 国产文本 LLM 适配层（零依赖，使用 Node 全局 fetch；Node ≥ 18）
// 支持：通义(qwen / dashscope OpenAI 兼容模式) 与 DeepSeek。
// 设计原则：密钥仅存于服务端（DASHSCOPE_API_KEY / DEEPSEEK_API_KEY），前端不接触；
// 未配置时所有方法抛「未配置」错误，调用方据此回落到确定性模板，绝不阻塞主流程。
'use strict';

const PROVIDERS = {
  qwen: {
    label: '通义千问',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelEnv: 'QWEN_MODEL',
    modelDefault: 'qwen-plus',
    keyEnv: 'DASHSCOPE_API_KEY'
  },
  deepseek: {
    label: 'DeepSeek',
    base: 'https://api.deepseek.com/v1',
    modelEnv: 'DEEPSEEK_MODEL',
    modelDefault: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY'
  }
};

function activeProvider() {
  const p = (process.env.TEXT_LLM_PROVIDER || 'none').toLowerCase();
  if (p === 'none' || !p) return null;
  return PROVIDERS[p] ? p : null;
}

function notConfiguredError(p) {
  const name = p ? PROVIDERS[p].label : '文本 LLM';
  return new Error('TEXT_LLM 未配置：请在 backend/.env 设置 TEXT_LLM_PROVIDER=' +
    (p || 'qwen|deepseek') + ' 及其 API key（' + name + '）。');
}

// 单次对话。messages: [{role:'system'|'user'|'assistant', content}]
async function chat(messages, opts) {
  opts = opts || {};
  const p = activeProvider();
  if (!p) throw notConfiguredError(p);
  const cfg = PROVIDERS[p];
  const key = process.env[cfg.keyEnv];
  if (!key) throw notConfiguredError(p);
  const model = process.env[cfg.modelEnv] || cfg.modelDefault;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 30000);
  try {
    const r = await fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        max_tokens: opts.max_tokens || 800
      }),
      signal: controller.signal
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(cfg.label + ' 返回 ' + r.status + (txt ? '：' + txt.slice(0, 200) : ''));
    }
    const j = await r.json();
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error(cfg.label + ' 返回内容为空');
    return String(content).trim();
  } finally {
    clearTimeout(timer);
  }
}

// 服务端缓存：同一画像只调一次 LLM，之后直接命中（省额度 + 秒回）。
// 进程内存存储，重启即失效（可接受——热门分享卡在进程生命周期内即可摊薄大量重复调用）。
const _summaryCache = new Map(); // key -> { text, ts }
const SUMMARY_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天
const SUMMARY_MAX = 5000;
function _summaryCacheKey(profile) {
  try { return JSON.stringify(profile); } catch (e) { return String(profile); }
}

// 基于审美画像生成「整体气质总结」文案（供分享卡展示，取代 / 增强确定性解读）。
// profile: { vector:{order,soft,...}, mood:[...], frameworks:[label...], explanation, title }
async function summarizeProfile(profile, opts) {
  opts = opts || {};
  const cacheKey = _summaryCacheKey(profile);
  const hit = _summaryCache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < SUMMARY_TTL) return hit.text;
  const vec = profile.vector || {};
  // 8 维审美向量的语义说明（领域常量，供 LLM 理解各轴含义）
  const DIM_LEGEND = {
    order: '秩序感（正=有序克制，负=自由流动）',
    soft: '柔和度（正=柔和温润，负=硬朗锐利）',
    warm: '暖度（正=温暖，负=冷峻）',
    explicit: '鲜明度（正=鲜明张扬，负=含蓄内敛）',
    natural: '自然感（正=自然有机，负=人工雕琢）',
    traditional: '传统度（正=传统经典，负=先锋实验）',
    light: '明度（正=明亮轻盈，负=深邃沉静）',
    sacred: '神性感（正=神圣仪式，负=世俗日常）'
  };
  const vecLines = Object.keys(DIM_LEGEND).map(k => {
    const v = Number(vec[k]);
    if (!isFinite(v)) return null;
    return '· ' + k + ' = ' + v.toFixed(2) + '，' + DIM_LEGEND[k];
  }).filter(Boolean);
  const mood = (profile.mood || []).join('、') || '（无）';
  const frameworks = (profile.frameworks || []).join('、') || '（无）';
  const existing = (profile.explanation || '').trim();
  const system = '你是「AI 审美系统」的气质解读师。你会拿到一个人的 8 维审美向量、情绪关键词、所属气质框架，以及系统已有的确定性解读。'
    + '请写一段 2~4 句、自然亲切、有洞察力的「整体气质总结」，像一位懂美学的朋友在描述这个人。'
    + '要求：不罗列数字；不编造未提供的信息；可与已有解读互补而非简单重复；专有名词（神性测评、混元、即梦）保持原样。只输出总结正文，不要解释。';
  const user = '【8 维审美向量】\n' + vecLines.join('\n') + '\n\n【情绪关键词】' + mood
    + '\n【气质框架】' + frameworks
    + (existing ? '\n\n【系统已有解读，可作参考 / 互补】\n' + existing : '');
  const text = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], Object.assign({ temperature: 0.8, max_tokens: 600 }, opts));
  // 仅缓存成功结果；未配置/失败由调用方回落，不写入缓存
  if (text) {
    _summaryCache.set(cacheKey, { text, ts: Date.now() });
    if (_summaryCache.size > SUMMARY_MAX) {
      const oldest = _summaryCache.keys().next().value;
      if (oldest !== undefined) _summaryCache.delete(oldest);
    }
  }
  return text;
}

module.exports = { activeProvider, chat, summarizeProfile, PROVIDERS };
