# ImageMythos · AI 审美系统

> 把一个人的「审美画像」变成**可生成的神性视觉**。

<p align="center">
  <img src="https://raw.githubusercontent.com/ShadowQuill/imagemythos/main/github-social-preview.png" alt="ImageMythos" width="100%">
</p>

**简介 / Description**

- 中文：基于 8 维审美向量的引擎，把你的审美画像变成可生成的神性视觉——生成专属星云 / 流场 / 星系，并支持出图、视频、3D 与分享卡。
- English: Turn your aesthetic profile into generative sacred art — an 8-dimension aesthetic-vector engine that renders personalized nebula, flow-field and galaxy visuals, with image/video/3D generation and shareable cards.

> 先通过九型 / 荣格 / 占星 三套问卷测量 8 维审美向量，引擎据此生成**专属的星云、流场、星系**，并进一步出图、生成视频与 3D 雕塑，可一键生成分享卡扩散。
>
> 线上示例：<https://imagemythos.fun/ai-aesthetic-engine/>

---

## ✨ 这是什么

ImageMythos 是一套「审美向量 → 生成式视觉」的系统：

1. **测量**：用户作答九型 / 荣格 / 占星 问卷，引擎融合出 8 维审美向量
   `order / soft / warm / explicit / natural / traditional / light / sacred`（各 ∈ [-1, 1]）。
2. **生成**：向量实时驱动三种 WebGL / Canvas 生成式画面——🌌 神性星云、🌊 神性流场、🌠 神性星系。
3. **外延**：基于画面出图（混元 / 即梦）、生成视频、生成 3D 神性雕塑，并打包成可分享的卡片。

不同性格、不同星座会生成不同**形态与配色**——同一套向量，既换色也换形。

---

## 🧩 核心特性

- **8 维审美向量引擎**：确定性融合、占星三要素（日/月/上升）加权、可复现的平票裁决。
- **三种生成式视觉**
  - 🌌 神性星云（WebGL2 片元着色器）：弥漫 / 行星状 / 超新星 / 暗星云 / 发射星云
  - 🌊 神性流场（Canvas2D Perlin）：湍流 / 均匀 / 弯曲 / 奇异线 / 奇异点
  - 🌠 神性星系（WebGL2 粒子）：螺旋 / 椭圆 / 透镜状 / 不规则 / 环 / 棒旋 / 并合
- **12 星座联动**：每个星座绑定一组配色 + 形态（火=螺旋/湍流、土=椭圆/均匀…），可选风格预设仅改色、星座仅改形，二者可叠加。
- **出图 / 视频 / 3D**：内置「图片视频生成」「3D 模型与视频特效」技能（腾讯混元 / 火山即梦 / 伙伴云）。
- **分享卡**：落页突出出图主视觉，视频 / 3D 以可折叠块展开。
- **管理后台**：账号体系、邮箱 / 重置码找回密码；非管理员禁止进入（服务端鉴权）。
- **零依赖后端**：Node.js 内置 `node:sqlite`，同局域网多设备共享同一份数据。

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 HTML / CSS / JS，WebGL2 / WebGL / Canvas2D 着色器 |
| 引擎 | `engine.js`（UMD，浏览器挂 `window.Engine`，Node 可 `require`） |
| 后端 | Node.js ≥ 22.5，内置 `node:sqlite`，**零第三方依赖** |
| 生成 | 内置多模态技能：混元生图 / 即梦 / 伙伴云 3D |

---

## 📁 目录结构

```
.
├── index.html                 # 产品/研究控制台（首页导航）
├── menu.md                    # 站点与本地入口导航
├── ai-aesthetic-engine/       # 审美向量引擎 + 生成式视觉前端
│   ├── index.html             # 测评 + 生成入口
│   ├── nebula.html / flowfield.html / galaxy.html
│   ├── share.html             # 分享卡落地页
│   ├── admin.html             # 管理后台（需管理员）
│   ├── engine.js / data.js    # 8 维融合引擎（UMD）
│   ├── questionBank.json / dimensions.json
│   └── providers/             # 出图/视频/3D 供应商适配
└── 问卷系统/backend/           # 零依赖 Node 服务
    ├── server.js              # 托管前端 + SQLite + REST API + 分享/管理
    ├── email.js / backup.js / watchdog.js
    └── .env.example
```

> 研究文档（调研 Brief、盲审、访谈、信效度等）**不在本仓库**，仅本地留存（见 `.gitignore`）。

---

## 🚀 快速开始

**前置**：Node.js ≥ 22.5（需内置实验性 `node:sqlite`）。

```bash
cd 问卷系统/backend
cp .env.example .env      # 填入密钥（见下）
node server.js
```

启动后访问 <http://localhost:3000/> （把 `localhost` 换成运行机器的局域网 IP 即可在他设备访问）。

**其他启动方式**

| 系统 | 操作 |
|---|---|
| macOS | 双击 `问卷系统/启动.command` |
| Windows | 双击 `问卷系统/启动.bat` |
| Linux / macOS 终端 | `cd 问卷系统 && ./start.sh`（`NO_OPEN=1 ./start.sh` 不自动开浏览器） |

---

## ⚙️ 配置（`.env`）

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|---|---|
| `IMG_PROVIDER` | 出图通道：`buddycloudimg`（默认混元）/ `jimeng` / `openai` / `none` |
| `JIMENG_ACCESS_KEY_ID` / `JIMENG_SECRET_ACCESS_KEY` | 火山即梦鉴权（选即梦时必填） |
| `BUDDY_CLOUD_TOKEN` | 内置混元 / 3D 技能会话令牌 |
| `ADMIN_EMAIL` | 命中此邮箱的账户自动置为管理员 |
| `RESET_CODE` | 自助重置密码共享码 |
| `SMTP_*` | QQ 邮箱 SMTP（验证码找回密码，可选） |

完整说明见 `问卷系统/backend/.env.example` 注释。

> ⚠️ 安全：`.env` 与 `*.db` 已被 `.gitignore` 排除，**不会进入版本库**。切勿把真实密钥或数据库提交到公开仓库。

---

## 🌐 部署

- 后端把**工作区根目录**作为静态根，同源托管所有页面与 `/api`。
- 数据库：`问卷系统/backend/data.db`（SQLite，首次运行自动创建）；`backup.js` 每 6 小时热备（`VACUUM INTO`，不锁写）。
- 公网示例：Caddy 反代 `:3000`（如 `imagemythos.fun`）。
- 异地访问：把 `server.js` 跑在公网主机，或将静态根指向任意目录：
  ```bash
  STATIC_DIR=/path/to/root PORT=8080 node 问卷系统/backend/server.js
  ```

---

## 📚 子模块文档

- `ai-aesthetic-engine/README.md` — 引擎算法、题库与题库盲审历程
- `问卷系统/backend/README.md` — 后端 API 与运行细节

## 🔌 后端 API 速查

- `GET  /api/health` → 健康检查 `{ ok: true, storage: "sqlite" }`
- `GET  /api/db`     → 返回全部受访者 JSON 数组
- `PUT  /api/db`     → 全量写入（body 为 JSON 数组）
- `GET  /api/admin/*`→ 管理员接口（统一 401/403 护盾）
