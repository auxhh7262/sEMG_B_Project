/**
 * logger.js - 小程序日志工具
 * 功能：
 *   1. 重写 console.log/warn/error，使其同时输出到控制台和发送到本地日志服务器
 *   2. 开发时发送到本地日志服务器（端口 9876）
 *   3. 生产时可配置发送到云函数
 * 
 * 使用方式：
 *   const logger = require('./utils/logger.js');
 *   logger.log('这是一条日志');
 *   logger.warn('这是一条警告');
 *   logger.error('这是一条错误');
 * 
 * 或者继续使用 console.log（已被重写）：
 *   console.log('这条日志会同时发送到日志服务器');
 */

const LOG_SERVER_IP = '192.168.137.1';  // 本地日志服务器 IP（修改为你的 PC IP）
const LOG_SERVER_PORT = 9876;
const LOG_SERVER_URL = `http://${LOG_SERVER_IP}:${LOG_SERVER_PORT}/log`;

// 是否启用本地日志服务器（开发时 true，生产时 false）
const ENABLE_LOCAL_LOG_SERVER = true;

// 保存原始的 console 方法
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

/**
 * 发送日志到本地服务器
 */
function sendToLogServer(level, msg) {
  if (!ENABLE_LOCAL_LOG_SERVER) return;
  
  try {
    wx.request({
      url: LOG_SERVER_URL,
      method: 'POST',
      header: {
        'content-type': 'application/json'
      },
      data: {
        level: level,
        msg: msg,
        time: new Date().toISOString()
      },
      fail: (err) => {
        // 发送失败时静默失败，避免无限循环
      }
    });
  } catch (e) {
    // 静默失败
  }
}

/**
 * 重写 console.log
 */
console.log = function(...args) {
  // 调用原始方法（输出到控制台）
  originalConsole.log.apply(console, args);
  
  // 发送到日志服务器
  const msg = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  sendToLogServer('INFO', msg);
};

/**
 * 重写 console.warn
 */
console.warn = function(...args) {
  originalConsole.warn.apply(console, args);
  
  const msg = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  sendToLogServer('WARN', msg);
};

/**
 * 重写 console.error
 */
console.error = function(...args) {
  originalConsole.error.apply(console, args);
  
  const msg = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  sendToLogServer('ERROR', msg);
};

/**
 * 导出 logger 对象（可选使用方式）
 */
module.exports = {
  log: function(...args) {
    console.log.apply(console, args);
  },
  warn: function(...args) {
    console.warn.apply(console, args);
  },
  error: function(...args) {
    console.error.apply(console, args);
  }
};
