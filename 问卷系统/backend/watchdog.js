/*
 * 进程守护看门狗（零依赖）
 * 拉起 server.js，子进程崩溃/退出时自动重启（带指数退避），
 * 并防止短时间内无限重启刷日志（雪崩保护）。
 *
 * 用法：
 *   node watchdog.js                # 前台运行（配合 systemd / launchd / nohup）
 *   PORT=3000 STATIC_DIR=/path node watchdog.js
 * 环境变量与 server.js 一致；watchdog 会强制注入 NO_OPEN=1（守护场景不弹浏览器）。
 */
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SCRIPT = path.join(__dirname, 'server.js');
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const MAX_RESTARTS = 50;            // 1 小时窗口内超过此次数则放弃，避免死循环刷日志
const WINDOW_MS = 60 * 60 * 1000;
let restarts = 0;
let windowStart = Date.now();

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[watchdog ${ts()}]`, ...a);
const err = (...a) => console.error(`[watchdog ${ts()}]`, ...a);

let current = null;        // 当前子进程句柄：停机时必须连它一起收走
let shuttingDown = false;  // 主动停机标志：此时子进程退出属预期，不再拉起

function start() {
  const env = Object.assign({}, process.env, { NO_OPEN: '1' });
  const child = spawn(process.execPath, [SCRIPT], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  current = child;
  log('spawned child pid=' + child.pid);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return; // 停机流程里由 shutdown() 负责退出
    log('child exited code=' + code + ' signal=' + signal);
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) { restarts = 0; windowStart = now; }
    restarts += 1;
    if (restarts > MAX_RESTARTS) {
      err('too many restarts (' + restarts + ') in window, giving up');
      process.exit(1);
    }
    const delay = Math.min(5000, 200 * restarts);
    log('restarting in ' + delay + 'ms (' + restarts + '/' + MAX_RESTARTS + ')');
    setTimeout(start, delay);
  });
  return child;
}

// 停机必须级联到子进程：只杀 watchdog 会让 server.js 被 init 收养、继续占着端口，
// 下次启动就会一路 EADDRINUSE 重启到放弃。
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(sig + ' received, stopping child pid=' + (current ? current.pid : 'none'));
  if (!current || current.exitCode !== null) process.exit(0);
  const hard = setTimeout(() => {
    err('child did not exit in 3s, sending SIGKILL');
    try { current.kill('SIGKILL'); } catch (e) {}
    process.exit(0);
  }, 3000);
  current.on('exit', () => { clearTimeout(hard); log('child stopped, exit'); process.exit(0); });
  try { current.kill('SIGTERM'); } catch (e) { clearTimeout(hard); process.exit(0); }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
