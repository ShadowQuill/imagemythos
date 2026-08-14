# AI 审美系统 · 问卷后台服务

零依赖的 Node 服务：用内建 `node:sqlite` 把受访者库持久化到数据库文件，
同时同源托管前端页面，并提供 REST API。这样数据不再存在浏览器 localStorage，
**换电脑、换浏览器都能用同一份数据**。

## 运行

```bash
cd 问卷系统/backend
node server.js
# 可选环境变量：
#   PORT=8080            监听端口（默认 3000）
#   STATIC_DIR=/path     前端静态根目录（默认是 backend 的上级目录，即「问卷系统」）
```

启动后访问：

- 问卷系统首页： http://localhost:3000/   （或 /问卷系统/index.html）
- 健康检查：     http://localhost:3000/api/health
- 数据接口：     GET /api/db  （读取全部受访者）
                PUT /api/db  （整体写入全部受访者，body 为 JSON 数组）

## 数据库

- 文件：`问卷系统/backend/data.db`（SQLite，首次运行自动创建）
- 备份：直接拷贝 `data.db` 即可。
- 数据以「每位受访者一行」存于 `respondents` 表（id 主键 + data JSON）。

## 前端如何连后端

页面打开时自动探测：
1. 同源 `/api/health` 可用 → 用后端数据库（跨设备共享）。
2. 都没有 → 回退为浏览器 localStorage（仅本机）。

> 说明：本套部署由 `server.js` 同源托管网页与 `/api`，无需手动配置后端地址——页面由后端打开即自动连库。
> 要让其他设备访问，把 `server.js` 跑在目标机器上，用该机器的 IP/地址打开页面即可（同局域网或公网均可）。
