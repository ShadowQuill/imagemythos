#!/bin/sh
# ============================================================
# AI 审美系统 · 后端进程守护启动脚本
# 用 watchdog.js 拉起 server.js：崩溃自动重启 + 防雪崩 + 日志落盘
#
# 用法：
#   ./start.sh            # 后台启动（nohup，日志 -> logs/server.log）
#   ./start.sh stop       # 停止
#   ./start.sh restart    # 重启
#   PORT=8080 ./start.sh  # 指定端口（STATIC_DIR 默认自动推导为项目根）
# ============================================================
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"

# 自动推导 STATIC_DIR：backend 的上两级即项目根（含 ai-aesthetic-engine/）
PROJECT_ROOT=$(cd "$DIR/../.." && pwd)
export PORT="${PORT:-3000}"
export STATIC_DIR="${STATIC_DIR:-$PROJECT_ROOT}"
export NO_OPEN=1
mkdir -p logs

# 等端口真正释放：进程收到信号到内核回收监听套接字之间有延迟，
# 不等就直接启动会撞上 EADDRINUSE，看门狗随后陷入重启退避直至放弃。
wait_port_free() {
  command -v lsof >/dev/null 2>&1 || { sleep 1; return 0; }
  i=0
  while [ "$i" -lt 20 ]; do
    lsof -ti tcp:"$PORT" >/dev/null 2>&1 || return 0
    sleep 0.3
    i=$((i + 1))
  done
  echo "warn: port $PORT still busy after 6s"
}

stop() {
  found=0
  # 先停看门狗（用绝对路径匹配，避免误杀其它项目的同名脚本）
  # 末尾 || true：pkill 没命中会返回 1，在 set -e 下会直接中断脚本
  pkill -f "$DIR/watchdog.js" 2>/dev/null && found=1 || true
  sleep 0.4
  # 再收掉它的 server 子进程：看门狗被杀后子进程会被 init 收养，必须显式清理，
  # 否则端口一直被占。同样按绝对路径匹配，只动本目录的进程。
  pkill -f "$DIR/server.js" 2>/dev/null && found=1 || true
  wait_port_free
  if [ "$found" = "1" ]; then echo "stopped"; else echo "not running"; fi
}

case "$1" in
  stop)    stop; exit 0 ;;
  restart) stop ;;
  *)       stop >/dev/null 2>&1 || true ;;
esac

nohup node "$DIR/watchdog.js" > logs/server.log 2>&1 &
echo "started pid $!  (PORT=$PORT STATIC_DIR=$STATIC_DIR)"
echo "tail -f logs/server.log"
