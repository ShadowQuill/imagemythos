// v1.0-internal -> v1.1-internal 题项修订
// 依据：盲审/G1盲审汇总报告.md 与 盲审/评审/*.json 三位评审人意见
// 原则：P1注意力落点 P2等价可欲 P3无通俗二分 P4无他评式 P5区分度 P6意象化
// 运行：node ai-aesthetic-engine/revise_v11.js
const fs = require('fs');
const path = require('path');

const BANK = path.join(__dirname, 'questionBank.json');
const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));

const S = n => ({ [String(n)]: 1 });
const opt = (n, text) => ({ text, signals: S(n) });

// ===== v1.1 九型题项（12 题，类型覆盖度与 v1.0 完全一致）=====
const items = [
  // e1 —— 盲审 3/3 保留（满分），原样保留
  {
    id: 'e1', type: 'projective',
    text: '看到「空旷雪原上一棵孤树」的图，你更被哪句感受抓住？',
    options: [
      opt(1, '一切本应可以更完美'),
      opt(2, '想有人一起静静待着'),
      opt(3, '想把它拍下来、做成作品'),
      opt(4, '觉得自己和树一样，孤独却完整')
    ]
  },
  // e2 —— 原「气氛尴尬你本能地」：行为反应题，被评"更贴性格而非神圣理念"
  // 改：把"你怎么做"换成"哪一刻你觉得反而是好的"，转为注意力落点
  {
    id: 'e2', type: 'projective',
    text: '一段对话忽然安静下来。让你觉得「这一刻反而是好的」，更接近？',
    options: [
      opt(5, '安静里，事情真实的轮廓浮了出来'),
      opt(6, '有人不动声色地留在原地，让人心里踏实'),
      opt(7, '空白像个入口，后面还有很多可能'),
      opt(8, '没人再演了，只剩下真实')
    ]
  },
  // e3 —— 原「你更认同哪种被需要」：自我标签式，3/3 revise（标签化、诱导性格）
  // 改：转为空间投射，问"什么让一个场所成立"，去自我人称
  {
    id: 'e3', type: 'projective',
    text: '想象一个你待着很舒服的场所。它之所以成立，更多因为？',
    options: [
      opt(9, '所有东西各在其位，彼此不冲突'),
      opt(1, '每处细节都恰到好处，没有多余'),
      opt(2, '它毫不费力地接纳了走进来的人'),
      opt(3, '它没被刻意经营，却长成了对的样子')
    ]
  },
  // e4 —— 原「深夜独处时你更常」：2 drop 1 revise（被读成自由散漫/冷静规划）
  // 改：整题替换为图像投射，覆盖类型不变（4,5,6,7）
  {
    id: 'e4', type: 'projective',
    text: '看到「雨后清晨、雾还没散的山谷」，你更被哪种感觉抓住？',
    options: [
      opt(4, '有种说不出的、只属于此刻的东西'),
      opt(5, '雾散开后，一切会变得很清楚'),
      opt(6, '它一直都在，天亮了还会在'),
      opt(7, '雾后面不知道有什么，让人想走进去')
    ]
  },
  // e5 —— 原「别人说你太……」：3/3 drop（他评式，无法做投射探测）
  // 改：整题替换为"哪句话让你心里一动"，直击各型神圣理念内核，覆盖不变（8,9,1,2）
  {
    id: 'e5', type: 'projective',
    text: '哪一句话，你听了会心里一动？',
    options: [
      opt(8, '「你不用绕，直接说就行。」'),
      opt(9, '「你在这里，本来就是合适的。」'),
      opt(1, '「已经很好了，不用再改了。」'),
      opt(2, '「你不需要做什么来换。」')
    ]
  },
  // e6 —— 原「重要任务临近你的状态」：被读成大胆/胆小，第2项"怕自己不够好"负面
  // 改：脱离任务表现框架，问"此刻希望身边有什么"，四项等价可欲
  {
    id: 'e6', type: 'projective',
    text: '一件重要的事就要开始了。此刻你更希望身边有什么？',
    options: [
      opt(3, '一条清楚的路径，走下去就会到'),
      opt(4, '一点只属于自己的、不必解释的时间'),
      opt(5, '足够的信息，让我看得见全貌'),
      opt(6, '一个不会走开的人，就在旁边')
    ]
  },
  // e7 —— 原「哪种自由打动你」：贴合度高(5/5/5)但第2项情绪浓、第2与第3语义相邻
  // 改：保留自由母题，选项全部意象化，拉开区分度
  {
    id: 'e7', type: 'projective',
    text: '「自由」这个词，让你先想到的画面更接近？',
    options: [
      opt(7, '前方有很多条路，每条都还没走过'),
      opt(8, '站在开阔处，风迎面来，没有遮挡'),
      opt(9, '一整个下午，没有任何事非做不可'),
      opt(1, '东西都在该在的位置，心里很清爽')
    ]
  },
  // e8 —— 原「给别人提建议」：3/3 revise（第1项"先共情"造成感性/理性二分）
  // 改：脱离建议框架，改为"什么真正能帮到他"，四项平行且均为"让他…"
  {
    id: 'e8', type: 'projective',
    text: '有人正处在难处。你觉得真正能帮到他的，更接近？',
    options: [
      opt(2, '让他知道，他不必先变好才值得被善待'),
      opt(3, '让他看见，事情本来就会朝好的方向长'),
      opt(4, '让他碰到自己心里那个最真的东西'),
      opt(5, '让他看清全貌，然后他自己就明白了')
    ]
  },
  // e9 —— 盲审 3/3 保留（满分），原样保留
  {
    id: 'e9', type: 'projective',
    text: '你最怕的关系是？',
    options: [
      opt(6, '随时要站队、担责任'),
      opt(7, '被框死、没新鲜感'),
      opt(8, '被控制、不得自由'),
      opt(9, '冲突不断、不得安宁')
    ]
  },
  // e10 —— 原「周末你更可能」：1 drop 2 revise（直陈行为、第2项"躲起来"负面）
  // 改：转为"一天结束时的满足感"，四项全正面
  {
    id: 'e10', type: 'projective',
    text: '一天结束时，哪种感觉更让你觉得「这天没有白过」？',
    options: [
      opt(1, '有些东西被我理顺了，变干净了'),
      opt(4, '我碰到了一点很真、很像自己的东西'),
      opt(7, '我遇到了一些原本不知道会遇到的'),
      opt(2, '有人因为我，今天松了一口气')
    ]
  },
  // e11 —— 原「你眼中的强者」：神圣理念贴合仅 2/1/2 分，"强者"框架天然召唤性格刻板印象
  // 改：彻底去人称，问"什么东西经得起时间"
  {
    id: 'e11', type: 'projective',
    text: '什么样的东西，会让你觉得「它经得起时间」？',
    options: [
      opt(3, '它一直在自然地生长，从没停过'),
      opt(6, '它经历过很多次动荡，仍在原地'),
      opt(9, '它不与任何东西为敌，所以无处可损'),
      opt(5, '它的道理是通的，所以不会塌')
    ]
  },
  // e12 —— 原「计划被打乱你？」：1 drop（诱导明显、选不出精神层面）+ 1 revise
  // 改：从"应对动作"转为"事后回看升起的感觉"，进入精神层面
  {
    id: 'e12', type: 'projective',
    text: '事情没有按预想发生。事后回看，你更容易生出哪种感觉？',
    options: [
      opt(8, '那一下反而让真实的东西露了出来'),
      opt(2, '那时有人愿意陪着，比原计划更要紧'),
      opt(5, '我原来漏看了一块，现在看全了'),
      opt(3, '它其实把我推去了更该去的地方')
    ]
  }
];

// ===== 校验：类型覆盖度必须与 v1.0 完全一致 =====
const OLD_COVERAGE = { 1: 5, 2: 6, 3: 6, 4: 5, 5: 6, 6: 5, 7: 5, 8: 5, 9: 5 };
const cov = {};
items.forEach(it => it.options.forEach(o =>
  Object.entries(o.signals).forEach(([t, w]) => { cov[t] = (cov[t] || 0) + w; })));

let ok = true;
for (const t of Object.keys(OLD_COVERAGE)) {
  if (cov[t] !== OLD_COVERAGE[t]) {
    console.error(`✗ 类型 ${t} 覆盖度 ${cov[t]} ≠ v1.0 的 ${OLD_COVERAGE[t]}`);
    ok = false;
  }
}
if (items.length !== 12) { console.error('✗ 题数应为 12，实际 ' + items.length); ok = false; }
items.forEach(it => {
  if (it.options.length !== 4) { console.error('✗ ' + it.id + ' 选项数≠4'); ok = false; }
  const types = it.options.map(o => Object.keys(o.signals)[0]);
  if (new Set(types).size !== 4) { console.error('✗ ' + it.id + ' 同题内类型重复'); ok = false; }
});
if (!ok) { console.error('\n覆盖度校验失败，未写入。'); process.exit(1); }

console.log('✓ 覆盖度校验通过：', JSON.stringify(cov));
console.log('✓ 12 题 × 4 选项，同题内无类型重复');

// ===== 写入 =====
bank.frameworks.enneagram.items = items;
bank.version = 'v1.1-internal';
bank.description = '自研题库 v1.1-internal：在 v1.0 基础上依据 G1 专家盲审意见修订九型题项——'
  + '删除他评式与性格化题项，全部改为「注意力落点」型投射题，四选项等价可欲、'
  + '消除通俗人格二分与负面情绪诱导；类型覆盖度与 v1.0 保持一致。'
  + '维度向量用 8 轴有符号值表示，正=posLabel 方向。图像部分待重绘后进入 v1.2。';
bank.frameworks.enneagram.revision = {
  from: 'v1.0-internal',
  basis: 'G1 专家盲审（n=3），题项平均一致率 77.8%，争议 9 项',
  kept: ['e1', 'e9'],
  rewritten: ['e2', 'e3', 'e6', 'e7', 'e8', 'e10', 'e11', 'e12'],
  replaced: [
    { id: 'e4', reason: '原「深夜独处」被读成自由散漫/冷静规划的性格选择（2 drop）' },
    { id: 'e5', reason: '原「别人说你太…」为他评式，无法做情境/投射间接探测（3 drop）' }
  ],
  principles: [
    'P1 注意力落点：问「什么让你停住」而非「你会怎么做」',
    'P2 等价可欲：四选项均为正面表述，消除社会赞许性偏差',
    'P3 无通俗二分：不可被读成感性/理性、大胆/胆小、自由/计划',
    'P4 无他评式：删除「别人说你」类题干',
    'P5 区分度：四选项指向明显不同的世界图景，避免语义相邻',
    'P6 意象化：用画面/场景承载，贴合审美系统定位'
  ]
};

fs.writeFileSync(BANK, JSON.stringify(bank, null, 2), 'utf8');
console.log('✓ 已写入', BANK, '→', bank.version);
