#!/bin/bash
# 一键启动 AI 审美系统问卷后台（后端同源托管前端 + SQLite 数据库）
# 用法：  ./start.sh            启动在 http://localhost:3000 并自动打开浏览器
#        PORT=8080 ./start.sh   自定义端口
#        NO_OPEN=1 ./start.sh   启动但不自动打开浏览器（远程/无桌面环境）
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

# 优先使用本机受管 Node 22（满足 node:sqlite 要求的 >=22.5），否则回退系统 node
NODE_BIN="/Users/hefeiyu/.workbuddy/binaries/node/versions/22.22.2/bin/node"
if [ ! -x "$NODE_BIN" ]; then NODE_BIN="node"; fi

echo "使用 Node: $($NODE_BIN -v 2>/dev/null || echo '未知')"

# 版本校验：node:sqlite 需要 Node >= 22.5
if ! "$NODE_BIN" -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22||(v[0]===22&&v[1]<5)){console.error('需要 Node >= 22.5，当前 '+process.versions.node); process.exit(2)}" 2>/dev/null; then
  echo "错误：Node 版本过低或无法运行。请安装 Node.js >= 22.5（https://nodejs.org）。"
  echo "      当前版本：$($NODE_BIN -v 2>/dev/null || echo '未知')"
  exit 1
fi

exec "$NODE_BIN" "$BACKEND_DIR/server.js"
