/**
 * utils/logger.js — 日志工具模块
 * 职责: 轻量级 console 封装，保持统一引用
 * 说明: console.log/warn/error 已在 app.js 的 onLaunch() 中重写，
 *       重写版本包含批量缓冲 + 网络转发（性能更优）。
 *       本文件仅做命名导出，各页面统一 require('utils/logger') 引用。
 * 导出: log() / warn() / error()
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
