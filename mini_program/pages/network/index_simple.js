// pages/network/index.js - 简化版（用于排查语法错误）
const { log, warn, error } = require('../../utils/logger');

Page({
  data: {
    connected: false,
    status: 'idle',
    statusMsg: '未连接',
  },

  onLoad() {
    log('[network] 页面加载');
    this.setData({ statusMsg: '网络配置页面（简化版）' });
  },

  onUnload() {
    log('[network] onUnload');
  },

  startScan() {
    log('[network] startScan（简化版，无功能）');
    wx.showToast({ title: '简化版，无BLE功能', icon: 'none' });
  },
});
