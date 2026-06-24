// pages/calibrate/index.js — Cloud Version
// 校准触发: 固件物理按钮 / 串口调试命令
// 校准结果显示: 读取 localStorage 或云数据库
const logger = require('../../utils/logger.js');
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

Page({
  data: {
    phase: 'idle',
    connected: false,
    currentUser: null,
    userMetaStr: '',
    showUserForm: false,
    liveRelaxRms: null, liveRelaxMdf: null,
    liveActiveRms: null, liveActiveMdf: null,
    relaxRms: null, relaxMdf: null,
    activeRms: null, activeMdf: null, endMdf: null,
    statusText: '请通过设备按钮启动校准，或使用串口指令',
    validation: null,
    saved: false,
  },

  onLoad() {
    this._checkCloudStatus();
    this._loadLatestCalib();
  },

  onShow() {
    this._checkCloudStatus();
    this._loadLatestCalib();
  },

  // ==================== Cloud Status ====================
  _checkCloudStatus() {
    if (wx.cloud) {
      this.setData({ connected: true });
    } else {
      this.setData({ connected: false, statusText: '云开发未启用，请在 app.js 中配置 CLOUD_ENV' });
    }
  },

  // ==================== Load Calibration ====================
  async _loadLatestCalib() {
    // Try localStorage first
    try {
      const c = wx.getStorageSync('calib_data');
      if (c && c.relax_rms) {
        this.setData({
          relaxRms: c.relax_rms, relaxMdf: c.relax_mdf || 0,
          activeRms: c.active_rms, activeMdf: c.active_mdf || 0,
          endMdf: c.end_mdf || 0,
          statusText: '已加载本地校准数据',
          saved: true,
        });
        return;
      }
    } catch (_) {}

    // Try cloud DB
    if (!wx.cloud) return;

    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });
      const res = await db.collection('sessions')
        .where({ status: 'completed' })
        .orderBy('ended_at', 'desc')
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        const s = res.data[0];
        if (s.calibration) {
          this.setData({
            relaxRms: s.calibration.relax_rms,
            relaxMdf: s.calibration.relax_mdf,
            activeRms: s.calibration.active_rms,
            activeMdf: s.calibration.active_mdf || 0,
            endMdf: s.calibration.end_mdf || 0,
            statusText: '已加载云端校准数据',
            saved: true,
          });
        }
      }
    } catch (e) {
      logger.warn('[calibrate] Cloud load failed:', e);
    }
  },

  // ==================== Manual Refresh ====================
  onRefresh() {
    this._loadLatestCalib();
    wx.showToast({ title: '已刷新', icon: 'success', duration: 1000 });
  },
});
