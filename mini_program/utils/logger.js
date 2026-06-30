/**
 * logger.js - 小程序日志工具
 * 说明：console.log/warn/error 已在 app.js 中重写，
 *       本文件仅提供命名导出，方便统一引用。
 *       app.js 的重写版本包含批量缓冲机制，性能更优。
 */

function log(...args) {
  console.log.apply(console, args);
}

function warn(...args) {
  console.warn.apply(console, args);
}

function error(...args) {
  console.error.apply(console, args);
}

module.exports = {
  log,
  warn,
  error
};
