// pages/calibrate/index.js — Cloud Version V3.0
// 校准通过云端中转：命令 → 云端 → 固件（轮询获取）
const logger = require('../../utils/logger.js');
const storage = require('../../utils/storage.js');
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

Page({
  data: {
    phase: 'idle',           // idle | relax | active_ready | active | result
    connected: false,
    currentUser: null,
    userMetaStr: '',
    showUserForm: false,

    // 实时显示（校准过程中）
    liveRelaxRms: null,
    liveRelaxMdf: null,
    liveActiveRms: null,
    liveActiveMdf: null,

    // 最终结果
    relaxRms: null,
    relaxMdf: null,
    activeRms: null,
    activeMdf: null,
    endMdf: null,

    statusText: '点击下方按钮开始校准',
    validation: null,
    saved: false,

    // 设备信息
    deviceId: '',
  },

  _deviceId: '',
  _pollingTimer: null,
  _calibPhase: 'idle',

  onLoad() {
    this._initDeviceId();
    this._loadUserProfile();
    this._loadCalibData();
  },

  onShow() {
    this._loadUserProfile();
    this._checkCloudStatus();
  },

  onHide() {
    this._stopPolling();
  },

  onUnload() {
    this._stopPolling();
  },

  // ==================== 初始化 ====================
  _initDeviceId() {
    const deviceId = storage.getDeviceId();
    this._deviceId = deviceId;
    this.setData({ deviceId });
  },

  _checkCloudStatus() {
    if (wx.cloud) {
      this.setData({ connected: true });
    } else {
      this.setData({ connected: false, statusText: '云开发未启用' });
    }
  },

  _loadUserProfile() {
    const user = storage.getCurrentUser();
    if (user) {
      this.setData({
        currentUser: user,
        userMetaStr: `${user.name} | ${user.age}岁 | ${user.gender === 1 ? '男' : '女'} | ${user.handedness === 1 ? '左手腕' : '右手腕'}`,
      });
    }
  },

  _loadCalibData() {
    try {
      const c = wx.getStorageSync('calib_data');
      if (c && c.relax_rms) {
        this.setData({
          relaxRms: c.relax_rms,
          relaxMdf: c.relax_mdf || 0,
          activeRms: c.active_rms,
          activeMdf: c.active_mdf || 0,
          endMdf: c.end_mdf || 0,
          saved: true,
          statusText: '已加载校准数据',
        });
      }
    } catch (_) {}
  },

  // ==================== 校准流程 ====================
  onStartCalibration() {
    // 检查用户信息
    const user = storage.getCurrentUser();
    if (!user || !user.name) {
      wx.showModal({
        title: '请先填写信息',
        content: '校准前需要填写个人信息',
        confirmText: '去填写',
        success: (res) => {
          if (res.confirm) {
            this.setData({ showUserForm: true });
          }
        },
      });
      return;
    }

    // 检查设备连接
    if (!this._deviceId) {
      wx.showToast({ title: '设备未连接', icon: 'none' });
      return;
    }

    this._startRelaxPhase();
  },

  async _startRelaxPhase() {
    this.setData({
      phase: 'relax',
      statusText: '请保持放松...',
      liveRelaxRms: null,
      liveRelaxMdf: null,
    });

    // 发送 record_relax 命令
    try {
      await this._sendCommand('record_relax');
      logger.log('[calibrate] record_relax sent');
    } catch (e) {
      logger.error('[calibrate] send record_relax failed:', e);
      wx.showToast({ title: '发送失败', icon: 'none' });
      this._resetAll();
      return;
    }

    // 开始轮询校准状态
    this._startPolling();
  },

  async _startActivePhase() {
    this.setData({
      phase: 'active',
      statusText: '请全力握紧拳头，保持15秒！',
      liveActiveRms: null,
      liveActiveMdf: null,
    });

    // 发送 record_active 命令
    try {
      await this._sendCommand('record_active');
      logger.log('[calibrate] record_active sent');
    } catch (e) {
      logger.error('[calibrate] send record_active failed:', e);
      wx.showToast({ title: '发送失败', icon: 'none' });
      this._resetAll();
      return;
    }
  },

  onStartActive() {
    this._startActivePhase();
  },

  onConfirmResult() {
    this._doSaveCalib();
  },

  onRetryCalib() {
    this._resetAll();
  },

  // ==================== 保存校准 ====================
  async _doSaveCalib() {
    const user = storage.getCurrentUser();

    try {
      await this._sendCommand('save_calib', {
        name: user?.name || '',
        age: user?.age || 0,
        gender: user?.gender || 1,
        handedness: user?.handedness || 2,
      });
      logger.log('[calibrate] save_calib sent');
    } catch (e) {
      logger.error('[calibrate] send save_calib failed:', e);
    }

    // 保存到本地
    const { relaxRms, relaxMdf, activeRms, activeMdf, endMdf } = this.data;
    const calibData = {
      relax_rms: relaxRms,
      relax_mdf: relaxMdf,
      active_rms: activeRms,
      active_mdf: activeMdf,
      end_mdf: endMdf,
    };
    wx.setStorageSync('calib_data', calibData);

    // 更新用户信息
    if (user) {
      user.relax_rms = relaxRms;
      user.active_rms = activeRms;
      storage.setCurrentUser(user);
      storage.saveCurrentUser(user);
    }

    this.setData({
      saved: true,
      statusText: '校准数据已保存',
    });

    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  // ==================== 云端命令 ====================
  async _sendCommand(command, params = {}) {
    if (!wx.cloud) throw new Error('云开发未启用');

    const db = wx.cloud.database({ env: CLOUD_ENV });
    await db.collection('device_commands').add({
      data: {
        device_id: this._deviceId,
        command,
        params,
        status: 'pending',
        created_at: Date.now(),
      },
    });
  },

  // ==================== 轮询校准状态 ====================
  _startPolling() {
    if (this._pollingTimer) return;

    this._pollingTimer = setInterval(() => {
      this._pollCalibStatus();
    }, 1000); // 每1秒轮询一次
  },

  _stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  },

  async _pollCalibStatus() {
    if (!wx.cloud || !this._deviceId) return;

    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });

      // 查询最新的校准结果（从 sessions 集合）
      const res = await db.collection('sessions')
        .where({
          device_id: this._deviceId,
          status: 'completed',
        })
        .orderBy('ended_at', 'desc')
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        const session = res.data[0];

        // 检查是否有新的校准结果
        if (session.calibration) {
          const { relax_rms, relax_mdf, active_rms, active_mdf, end_mdf } = session.calibration;

          if (relax_rms && !this.data.relaxRms) {
            // relax 完成
            this.setData({
              relaxRms: relax_rms,
              relaxMdf: relax_mdf || 0,
              phase: 'active_ready',
              statusText: '放松校准完成，请握紧拳头至最大力，准备好了就点击下方按钮',
            });
            this._stopPolling();
            return;
          }

          if (active_rms && !this.data.activeRms) {
            // active 完成
            this.setData({
              activeRms: active_rms,
              activeMdf: active_mdf || 0,
              endMdf: end_mdf || 0,
              phase: 'result',
              statusText: '校准完成，请确认结果',
            });
            this._validateResult();
            this._stopPolling();
            return;
          }
        }
      }

      // 继续轮询直到完成或超时（最多5分钟）
      // 注：固件端日志会显示校准进度

    } catch (e) {
      logger.error('[calibrate] poll status error:', e);
    }
  },

  // ==================== 校验 ====================
  _validateResult() {
    const { relaxRms, relaxMdf, activeRms, activeMdf } = this.data;

    const rms_ok = activeRms > relaxRms * 2.0 && activeRms >= 0.0005;
    const mdf_ok = relaxMdf >= 10 && relaxMdf <= 250 && (!activeMdf || (activeMdf >= 10 && activeMdf <= 250));

    this.setData({
      validation: {
        ok: rms_ok && mdf_ok,
        rms_ok,
        mdf_ok,
      },
    });
  },

  // ==================== 重置 ====================
  _resetAll() {
    this._stopPolling();
    this.setData({
      phase: 'idle',
      statusText: '点击下方按钮开始校准',
      validation: null,
      saved: false,
      liveRelaxRms: null,
      liveRelaxMdf: null,
      liveActiveRms: null,
      liveActiveMdf: null,
    });
  },

  // ==================== 用户表单 ====================
  onShowUserForm() {
    this.setData({ showUserForm: true });
  },

  onHideUserForm() {
    this.setData({ showUserForm: false });
  },

  onUserFormSubmit(e) {
    const { name, age, gender, handedness } = e.detail.value;
    if (!name || !age) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    const user = {
      name,
      age: parseInt(age),
      gender: parseInt(gender),
      handedness: parseInt(handedness),
    };

    storage.setCurrentUser(user);
    storage.saveCurrentUser(user);

    this.setData({
      currentUser: user,
      userMetaStr: `${name} | ${age}岁 | ${gender === 1 ? '男' : '女'} | ${handedness === 1 ? '左手腕' : '右手腕'}`,
      showUserForm: false,
    });

    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  // ==================== 刷新 ====================
  onRefresh() {
    this._loadCalibData();
    wx.showToast({ title: '已刷新', icon: 'success', duration: 1000 });
  },
});
