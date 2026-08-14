'use strict';
/**
 * SQLite 自动备份（零依赖）
 *
 * 为什么用 VACUUM INTO 而不是 cp：
 *   直接复制 data.db 可能拷到「写到一半」的状态（尤其还有 -wal / -shm 时），
 *   恢复出来是坏库。VACUUM INTO 由 SQLite 自己在事务里产出一个完整、已压实的副本，
 *   不锁写、不依赖外部工具，是官方推荐的热备方式。
 *
 * 用法（被 server.js require）：
 *   const backup = require('./backup');
 *   backup.init(db, { dir, keep, intervalH });   // 启动定时备份
 *   backup.runOnce(db);                           // 手动备份，返回 { file, size, at }
 *   backup.list();                                // 备份列表（新→旧）
 */
const fs = require('fs');
const path = require('path');

let CFG = { dir: path.join(__dirname, 'backups'), keep: 14, intervalH: 6 };
let timer = null;
let lastResult = null;   // 最近一次备份结果，供后台展示

function ensureDir() {
  try { fs.mkdirSync(CFG.dir, { recursive: true }); } catch (e) { /* 已存在 */ }
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/** 列出备份（新→旧） */
function list() {
  ensureDir();
  let names = [];
  try { names = fs.readdirSync(CFG.dir); } catch (e) { return []; }
  return names
    .filter(n => /^data-\d{8}-\d{6}\.db$/.test(n))
    .map(n => {
      const fp = path.join(CFG.dir, n);
      let st = null;
      try { st = fs.statSync(fp); } catch (e) { return null; }
      return { name: n, size: st.size, mtime: st.mtime.toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** 按 keep 轮转，删掉最旧的 */
function rotate() {
  const all = list();
  const extra = all.slice(CFG.keep);
  const removed = [];
  for (const f of extra) {
    try { fs.unlinkSync(path.join(CFG.dir, f.name)); removed.push(f.name); } catch (e) { /* 忽略 */ }
  }
  return removed;
}

/**
 * 执行一次备份。
 * @param {object} db 已打开的 DatabaseSync 实例
 * @returns {{ok:boolean, file?:string, size?:number, at?:string, removed?:string[], error?:string}}
 */
function runOnce(db) {
  ensureDir();
  const at = new Date();
  const name = 'data-' + stamp(at) + '.db';
  const dest = path.join(CFG.dir, name);
  try {
    // 同名文件先清掉：同一秒内重复触发会让 VACUUM INTO 直接报错
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (e) { /* 忽略 */ }
    // 路径里的单引号要转义，否则 SQL 字符串会被截断
    db.exec("VACUUM INTO '" + dest.replace(/'/g, "''") + "'");
    const size = fs.statSync(dest).size;
    const removed = rotate();
    lastResult = { ok: true, file: name, size, at: at.toISOString(), removed };
    console.log('[backup] ok ' + name + ' (' + size + 'B)' + (removed.length ? ' 轮转删除 ' + removed.length + ' 个' : ''));
  } catch (e) {
    lastResult = { ok: false, error: String((e && e.message) || e), at: at.toISOString() };
    console.error('[backup] 失败：', lastResult.error);
  }
  return lastResult;
}

function status() {
  const all = list();
  return {
    dir: CFG.dir,
    keep: CFG.keep,
    intervalH: CFG.intervalH,
    count: all.length,
    latest: all[0] || null,
    totalSize: all.reduce((s, f) => s + f.size, 0),
    last: lastResult,
  };
}

/** 启动定时备份。启动后延迟 30 秒先备一次，避免和启动期的初始化抢 IO。 */
function init(db, opts) {
  CFG = Object.assign({}, CFG, opts || {});
  CFG.keep = Math.max(1, Number(CFG.keep) || 14);
  CFG.intervalH = Math.max(0.05, Number(CFG.intervalH) || 6);
  ensureDir();
  if (timer) clearInterval(timer);
  const first = setTimeout(() => runOnce(db), 30e3);
  if (first.unref) first.unref();
  timer = setInterval(() => runOnce(db), CFG.intervalH * 3600e3);
  if (timer.unref) timer.unref();  // 不因为定时器而阻止进程退出
  console.log('[backup] 已启用：每 ' + CFG.intervalH + 'h 一次，保留 ' + CFG.keep + ' 份，目录 ' + CFG.dir);
}

/**
 * 删除单个备份（严格校验文件名 + 路径穿越防护）。
 * @param {string} name 形如 data-YYYYMMDD-HHMMSS.db
 * @returns {{ok:boolean, removed?:string, error?:string}}
 */
function remove(name) {
  if (typeof name !== 'string' || !/^data-\d{8}-\d{6}\.db$/.test(name)) {
    return { ok: false, error: '非法的备份文件名' };
  }
  // 解析后的真实路径必须严格落在备份目录内，杜绝 ../ 穿越
  const base = path.resolve(CFG.dir);
  const real = path.resolve(CFG.dir, name);
  if (real !== path.join(base, name)) {
    return { ok: false, error: '非法路径' };
  }
  try {
    fs.unlinkSync(real);
    console.log('[backup] 手动删除 ' + name);
    return { ok: true, removed: name };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** 主动清理：只保留最新 keep 份，返回被删列表 */
function cleanup() {
  const removed = rotate();
  console.log('[backup] 主动清理，删除 ' + removed.length + ' 份');
  return { ok: true, removed, status: status() };
}

module.exports = { init, runOnce, list, status, rotate, remove, cleanup, get dir() { return CFG.dir; } };
