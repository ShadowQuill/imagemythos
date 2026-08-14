# 导航菜单（Menu）

> 本仓库页面与本地入口速查。先启动后端（见「本地运行」），再用「本地访问路径」打开。
> 线上版：<https://imagemythos.fun/ai-aesthetic-engine/>

---

## 产品页面（ImageMythos）

| 页面 | 本地访问路径 | 说明 |
|---|---|---|
| 控制台 / 首页 | `http://localhost:3000/` | 产品/研究导航入口 |
| 审美测评 + 生成 | `/ai-aesthetic-engine/index.html` | 测 8 维审美向量，生成神性视觉 |
| 🌌 神性星云 | `/ai-aesthetic-engine/nebula.html` | WebGL 片元着色器星云（弥漫/行星状/超新星…） |
| 🌊 神性流场 | `/ai-aesthetic-engine/flowfield.html` | Canvas2D Perlin 流场（湍流/均匀/奇异点…） |
| 🌠 神性星系 | `/ai-aesthetic-engine/galaxy.html` | WebGL 粒子星系（螺旋/椭圆/透镜/不规则…） |
| 分享卡 | `/ai-aesthetic-engine/share.html?id=...` | 出图/视频/3D 分享落地页 |
| 管理后台 | `/ai-aesthetic-engine/admin.html` | 仅管理员（服务端鉴权） |

---

## 引擎：数据与代码

| 说明 | 路径 |
|---|---|
| 8 维融合引擎（UMD） | `ai-aesthetic-engine/engine.js` |
| 全局数据（内联） | `ai-aesthetic-engine/data.js` |
| 题库源数据 | `ai-aesthetic-engine/questionBank.json` |
| 维度定义 | `ai-aesthetic-engine/dimensions.json` |
| 出图 / 视频 / 3D 供应商 | `ai-aesthetic-engine/providers/` |
| 单元测试 | `ai-aesthetic-engine/engine.test.js` |

---

## 后端

| 说明 | 路径 |
|---|---|
| 零依赖 Node 服务 | `问卷系统/backend/server.js` |
| 配置样例（需复制为 `.env`） | `问卷系统/backend/.env.example` |
| 邮箱 / 备份 / 看门狗 | `问卷系统/backend/email.js` · `backup.js` · `watchdog.js` |

---

## 本地运行

```bash
cd 问卷系统/backend && node server.js      # 默认监听 :3000
```

| 系统 | 操作 |
|---|---|
| macOS | 双击 `问卷系统/启动.command` |
| Windows | 双击 `问卷系统/启动.bat` |
| Linux / macOS 终端 | `cd 问卷系统 && ./start.sh`（无桌面加 `NO_OPEN=1`） |

前置：Node.js ≥ 22.5。详细见 `README.md`。

---

## 研究文档

> 调研 Brief、盲审、访谈、信效度等文档**不在本仓库**（被 `.gitignore` 排除），仅本地留存。
