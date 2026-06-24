// app.js — Cloud Version
// 删除: wifiClient / bleClient / 连接管理 / 网络预热 / 僵尸检测
// 新增: 云开发初始化
"use strict";

const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

/* ================= 日志配置 ================= */
const LOG_ENABLED = true;
const LOG_SERVER_URL = 'http://192.168.137.1:9876/log';
const LOG_BATCH_SIZE = 10;
const LOG_BATCH_INTERVAL = 500;
let _logBuffer = [];
let _logTimer = null;

function _flushLog() {
  if (_logBuffer.length === 0) return;
  const batch = _logBuffer.splice(0, LOG_BATCH_SIZE);
  wx.request({
    url: LOG_SERVER_URL, method: 'POST',
    header: { 'content-type': 'application/json' },
    data: { logs: batch }
  });
}

function _forwardLog(level, args) {
  if (!LOG_ENABLED) return;
  const preview = args[0] ? String(args[0]) : '';
  if (preview.startsWith('[LogForward]')) return;
  const msg = args.map(v => {
    if (v == null) return 'null';
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  }).join(' ');
  _logBuffer.push({ level, msg, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) });
  if (_logBuffer.length >= LOG_BATCH_SIZE) {
    _flushLog();
  } else if (!_logTimer) {
    _logTimer = setTimeout(() => { _logTimer = null; _flushLog(); }, LOG_BATCH_INTERVAL);
  }
}

/* ================= App ================= */
App({
  dataMode: 'idle',

  onLaunch() {
    const _origLog = console.log;
    const _origWarn = console.warn;
    const _origError = console.error;
    console.log = (...args) => { _origLog.apply(console, args); _forwardLog('log', args); };
    console.warn = (...args) => { _origWarn.apply(console, args); _forwardLog('warn', args); };
    console.error = (...args) => { _origError.apply(console, args); _forwardLog('error', args); };

    _origLog('[App] 小程序启动 (Cloud)');

    // 云开发初始化
    if (CLOUD_ENV && CLOUD_ENV !== 'YOUR-ENV-ID') {
      try {
        wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
        _origLog('[App] 云开发初始化成功, env=' + CLOUD_ENV);
      } catch (e) {
        _origError('[App] 云开发初始化失败:', e);
      }
    } else {
      _origWarn('[App] CLOUD_ENV 未配置，云开发未启用');
    }

    // 日志连通性测试
    wx.request({
      url: LOG_SERVER_URL, method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { logs: [{ level: 'log', msg: '[PING] 真机日志连通性测试', time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }] },
      success(res) { _origLog('[PING] OK status=' + res.statusCode); },
      fail(err) { _origLog('[PING] FAIL ' + err.errMsg); }
    });
  },

  onShow() {
    console.log('[App] onShow — Cloud mode, no connection needed');
  },

  setDataMode(newMode) {
    const prevMode = this.dataMode;
    if (prevMode === newMode) return prevMode;
    console.log('[App] 数据模式切换:', prevMode, '→', newMode);
    this.dataMode = newMode;
    return prevMode;
  }
});
