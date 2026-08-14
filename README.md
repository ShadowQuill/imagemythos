# AI 审美系统 · 问卷筛选与访谈系统

> 一个纯前端 + 轻量 Node 后端的本地研究工具集，覆盖受访者筛选、盲审评分、审美题库管理等环节。
> 数据通过 Node 内建的 `node:sqlite` 持久化到 SQLite 文件，**支持同局域网（Wi-Fi）内多设备、多浏览器共享**，无需云服务器。

---

## 目录结构

```
.
├── index.html                 # 研究控制台（首页 / 导航入口）
├── 问卷系统/                  # 受访者库 + 后端服务
│   ├── index.html             # 受访者库（带数据库）
│   ├── 筛选问卷/              # 招募筛选问卷页
│   ├── backend/
│   │   ├── server.js          # 零依赖后端（托管前端 + SQLite 存储 + API）
│   │   ├── package.json
│   │   └── README.md
│   ├── data.js / engine.js    # 前端共享脚本
│   ├── 启动.command           # macOS 双击启动器
│   ├── 启动.bat               # Windows 双击启动器
│   └── start.sh               # Linux / macOS 终端启动器
├── 盲审/                      # 盲审题集与评审
│   ├── web/index.html         # 在线盲审页
│   ├── 盲审录入.html          # 离线盲审录入
│   └── web/blindset.json      # 盲集数据
├── ai-aesthetic-engine/       # 审美题库与维度引擎
│   ├── index.html             # 引擎主页
│   ├── questionBank.json      # 题库
│   └── dimensions.json        # 维度定义
└── *.md                       # 调研 Brief、SOP、访谈提纲等文档
```

---

## 快速开始：启动系统

### 前置要求
- **Node.js ≥ 22.5**（使用了内建实验性 `node:sqlite` 模块）。
  下载：<https://nodejs.org>（选 LTS 22 即可）。
  安装后在终端执行 `node -v` 确认版本。

### 方式一：双击启动（最省事，自动开浏览器）
| 系统 | 操作 |
|---|---|
| **macOS** | 双击 `问卷系统/启动.command` |
| **Windows** | 双击 `问卷系统/启动.bat` |

启动后浏览器会自动打开「研究控制台」。关闭启动器窗口（或按 `Ctrl+C`）即停止服务。

### 方式二：终端启动（所有系统通用）
```bash
cd 问卷系统/backend
node server.js
```
启动后浏览器打开 <http://localhost:3000/> 。

### 方式三：Linux / macOS 一键脚本
```bash
cd 问卷系统
./start.sh            # 启动并自动开浏览器
NO_OPEN=1 ./start.sh  # 无桌面环境（服务器）启动，不自动开浏览器
```

### 各系统启动对照表
| 系统 | 双击启动器 | 终端命令 | 备注 |
|---|---|---|---|
| macOS | `问卷系统/启动.command` | `cd 问卷系统/backend && node server.js` | 已自带 Node 22 |
| Windows | `问卷系统/启动.bat` | `cd 问卷系统\backend` → `node server.js` | 安装 Node 时勾选「Add to PATH」 |
| Linux | （无 GUI 双击） | `cd 问卷系统 && ./start.sh` | 需先 `chmod +x start.sh`（已就绪） |

---

## 跨设备 / 跨系统迁移须知（重要）
后端默认把**工作区根目录**（即本 `README.md` 所在目录，含 `index.html`、`问卷系统/`、`盲审/`、`ai-aesthetic-engine/`）作为网站根。
因此：

1. **迁移到其他机器时，必须把这整个工作区目录一起拷贝**，保持目录层级，**不能只拷 `问卷系统/`**。否则打开 `/` 会找不到控制台、内部链接也会失效。
2. 目标机器需先安装 Node ≥ 22.5。
3. 数据文件 `问卷系统/backend/data.db`（SQLite）随目录一起走；换机器后数据自动跟随。

> 如果只想要受访者库这份数据而不带其他子项目，可自行用 `STATIC_DIR` 环境变量把静态根指向任意目录：
> `STATIC_DIR=/path/to/root PORT=8080 node 问卷系统/backend/server.js`

---

## 启动后访问地址

通过 `http://localhost:3000/` 访问（将 `localhost` 换成运行服务那台机器的局域网 IP，即可在其他设备访问）：

| 页面 | 路径 |
|---|---|
| 研究控制台（首页） | `/` 或 `/index.html` |
| 受访者库（数据库） | `/问卷系统/index.html` |
| 筛选问卷 | `/问卷系统/筛选问卷/index.html` |
| 盲审（在线） | `/盲审/web/index.html` |
| 盲审（离线录入） | `/盲审/盲审录入.html` |
| AI 审美引擎 | `/ai-aesthetic-engine/index.html` |

---

## 数据存储

- 所有受访者数据落在 **`问卷系统/backend/data.db`**（SQLite 文件）。
- 这是**唯一数据源**：运行 `node server.js` 的那台机器要一直开着，其他设备才能读到同步数据。
- 跨设备共享 = 同局域网访问同一地址；异地访问需把后端部署到公网主机或配置隧道（本项目默认本地方案）。
- 浏览器本地也有 localStorage 缓存作为回退；但只要后端在线，优先写入数据库。

---

## 后端 API 速查
- `GET  /api/health` → 健康检查 `{ ok: true, storage: "sqlite" }`
- `GET  /api/db`     → 返回全部受访者 JSON 数组
- `PUT  /api/db`     → 全量写入（body 为 JSON 数组），`Content-Type: application/json`

---

## 常见问题
- **端口被占用**：启动时指定其他端口 `PORT=8080 node 问卷系统/backend/server.js`，访问对应端口即可。
- **CloudStudio（HTTPS）页面填了 http 后端连不上**：浏览器会因「混合内容」拦截。要么直接用后端同源页面（`http://<机器IP>:3000/`），要么给后端配 HTTPS 地址再填。
- **Node 版本过低报错**：`node:sqlite` 需要 ≥ 22.5，升级 Node 即可。

详见 `问卷系统/backend/README.md`。
