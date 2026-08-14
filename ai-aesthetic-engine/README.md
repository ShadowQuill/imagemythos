# AI 审美系统 · 核心运行包（ai-aesthetic-engine）

把「性格 + 神性（4 框架）」映射为整体美学气质向量的融合引擎与可运行演示的**最小自包含包**。本包是单一真相源（single source of truth），问卷系统通过 `<script src>` 引用本包的 `data.js` / `engine.js`，请勿各自维护副本。

## 目录结构

```
ai-aesthetic-engine/
├── engine.js          # 融合引擎（UMD：浏览器挂 window.Engine，Node 下 require 同目录 JSON）
├── data.js            # 由 questionBank.json + dimensions.json 内联生成的全局数据
├── questionBank.json  # 题库源数据（九型 12 题 / 荣格 12 题 / 占星 18 题 / 大五）
├── dimensions.json    # 8 轴美学维度定义源数据
├── build_data.js      # 改了题库后重新生成 data.js：node build_data.js
├── index.html         # 演示页（含占星三要素权重滑杆联动）
├── engine.test.js     # 19/19 单元测试：node engine.test.js
├── sim_validate.js    # 内部模拟校验：分布/覆盖/aspect加权/退化检测
└── assets/            # 9 张神圣理念图像（v1 内部验证版，已去水印）
```

## 运行

- 方式 A（最简单）：直接双击 `index.html`（file:// 即可运行，`data.js` 内联全局避免 fetch CORS）
- 方式 B：起静态服务器后访问，例如 `python -m http.server 8000` → `http://localhost:8000`

Node 侧：`node engine.test.js` 跑全部单测。

## 核心算法

1. **8 轴语义空间**：`order / soft / warm / explicit / natural / traditional / light / sacred`，各取值 [-1, 1]。
2. **每框架产出主+次**：每个框架计分得到 `primary` 与 `secondary`。
3. **融合（主定调 · 次点缀）**：`primary` 作为 anchor 定调；`secondary` 以 accent 权重点缀，上限 `ACCENT_CAP = 0.2`（仅局部加权，不整体平移向量）。
4. **占星三要素归一化加权平均**：太阳/月亮/上升按 `aspectWeights` 做 `aVec = Σ(wᵢ · 要素ᵢ向量) / Σwᵢ`，权重直接决定各要素占比，滑杆可感。
5. **确定性 tie-break**：分数相同时按固定优先级裁决，保证可复现。

## 数据格式

- `dimensions.json`：`{ "dimensions": [ { "id", "label", "pole_neg", "pole_pos", ... } ] }`
- `questionBank.json`：
  ```
  {
    "frameworks": {
      "<id>": {
        "name", "measurement"?,            // indirect = 间接测量（如九型·神圣理念）
        "holyIdeaDraft"?,                  // false = v1 内部验证；true = 仍待盲审
        "aspectWeights"?,                  // 占星专用 {sun, moon, asc}
        "items": [ { "id", "aspect"?, "options": [ { "label", "signals": {"<typeId>": <weight>} } ] } ],
        "results": { "<key>": { "label", "vector": {"<dimId>": <val>} } }
      }
    },
    "signs": { "<signName>": { "vector": {"<dimId>": <val>} } }
  }
  ```

## 移植注意

- 浏览器端**必须按顺序**加载 `data.js`（先）再 `engine.js`（后）；`engine.js` 读取 `window.AESTHETIC_DATA`。
- **不要**在 file:// 下用 `fetch` 加载 JSON（CORS 限制）；本包用 `data.js` 内联全局规避。
- 问卷系统（`../问卷系统/index.html`）已改为引用本包，删除其内联副本；移动本包需同步更新其 `<script src>` 相对路径。

## 内部验证（v1.0-internal）

本轮 v0→v1 未依赖外部盲审，改为内部验证，已做：

1. **24 题编辑审查**：九型/荣格各 12 题，逐题检查措辞一致性、间接测量是否泄露答案、选项平衡与信号映射；确认主信号覆盖 {1..9} 与 12 原型各 ≥4 次，无结构性问题。
2. **引擎模拟试跑**（`sim_validate.js`，N=20,000）：
   - 九型/荣格/占星主结果 **平票率 0%、空主率 0%**，固定 tie-break 生效；
   - 占星三要素 sign 覆盖 **12/12**；
   - aspect 加权三场景（等权=均值 / 太阳独大=太阳向量 / 默认 1/0.6/0.4=归一化加权平均）**全部 PASS**；
   - 端到端随机 5,000 次 **零向量率 0%、报错率 0%**。
3. **9 图自我一致性检查**：逐一比对 9 张神圣理念图像与其对应类型的 8 轴向量方向，整体匹配良好，无明显偏离（注：AI 审 AI 图，属内部 sanity check，非外部效度）。

## G1 专家盲审 R1 与 v1.1 修订（2026-08-06）

题库在 v1.0-internal 基础上做了首轮外部专家盲审（n=3）：

- **R1 结果：未通过** —— 题项平均一致率 77.8%（门槛 ≥80%）、争议 9 项（门槛 ≤2）；图像 92.6% 通过。
- **根本病灶**：原题用「你会怎么做／你是什么样的人」的行为—性格框架，只能测出通俗人格二分，测不到神圣理念；且多个选项带负面色彩，造成社会赞许性偏差（本该选它的人回避）。
- **v1.1 修订**：删除 2 题（他评式 `e5`、性格化 `e4`）、重写 8 题、保留 2 题（`e1`/`e9`，盲审满分）。全部改为「注意力落点」型投射题，四选项等价可欲。
- **关键约束**：每题「选项位置 → 类型」映射保持不变，类型覆盖度 `{1:5,2:6,3:6,4:5,5:6,6:5,7:5,8:5,9:5}` 与 v1.0 完全一致，故属纯文本层修订，引擎行为严格可比。
  - 修订脚本：`revise_v11.js`（含覆盖度自校验）｜ 详细对照：`../盲审/v1.1题项修订说明.md` ｜ v1.0 存档：`versions/questionBank_v1.0-internal.json`

## G1 盲审 R2/R3 与 v1.2 定稿（2026-08-06）

R1 未过后，依次发起 R2（全量复审 v1.1）、R3（增量复审 v1.2）：

- **R2（v1.1）**：题项一致率 88.9%、图像 100%，但争议 4 项 > 2 → 未过。争议全部集中在含「有人/的人」的型2/型6 信号选项，被读成性格倾向。
- **v1.2 修订**：新增设计原则 **P7「去人称化」**，把关系性理念选项改写为无主语的场域状态（如「有人愿意陪着」→「那一刻被接住的感觉」），并重绘 Image F；题干/选项顺序/signals 映射不变，与历史版本逐题可比。
- **R3（v1.2 增量复审）**：仅重评 5 题 + Image F，三评审 **3/3 全票保留** → 题项一致率 100%、图像 100%、争议 0 → **G1 ✅ 通过**。
- 里程碑写入 `questionBank.json` / `data.js` 的 `enneagram.g1BlindReview{passed:true, rounds:[R1,R2,R3]}`。
- 详细报告：`../盲审/G1盲审汇总报告.md`；R3 增量盲集：`../盲审/G1盲审题集_R2_v1.1.json`（基线）+ `../盲审/G1盲审题项集.json`（R3 增量）。

## 状态

- 引擎与题库已升至 **v1.2-internal**：**G1 盲审已通过**（R1→R2→R3 三轮，题项/图像一致率均 100%、争议 0），`holyIdeaDraft=false`，可直接用于自建平台 MVP。
- **已知局限**：
  - R1 盲审未通过、R2 复审尚未发起，题项修订效果未经外部验证；
  - 图像 `holy_idea_2.png`（型2）曾被 3/3 评审判定需修订（"负面、病态怪异"），已于 2026-08-06 重绘（幽灵半透明→实体人物，去受难姿态与肉粉色，改晨光琥珀调）；**新图效果待 R2 复审验证**，被否原图存档于 `../神圣理念图像/v1.0_rejected/`，备选版本（无五官逆光剪影）存于 `../神圣理念图像/candidates/`；
  - 图像 `holy_idea_6.png` / `holy_idea_7.png` 各有 1 人评"杂乱"，暂缓处理；
  - 未做用户重测信度 / 区分效度 / 效标关联效度研究；
  - 题项选项位置在 v1.2 已实现**每会话随机化**（展示顺序打乱、`radio.value` 固定为原始下标，引擎计分零改动），消除位置偏见；盲审题项集（`../盲审`）为固定顺序，用于可比性评审，不受此影响；
  - 图像右下角有去水印修复痕迹，个别图可见轻微平滑渐变。
- 云端资料库（netdrive）上传仍阻塞，本包仅存于本地。
