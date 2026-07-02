// pages/calibrate/index.js — 校准页面
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
  _commandSent: false,
  _phaseTimeout: null,
  _phaseStartTs: 0,
  _calibStartTs: 0,

  onLoad() {
    logger.log('[calibrate] onLoad');
    this._initDeviceId();
    this._loadUserProfile();
    this._loadCalibData();
  },

  onShow() {
    logger.log('[calibrate] onShow');
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
    if (deviceId) {
      this._deviceId = deviceId;
      this.setData({ deviceId });
      logger.log('[calibrate] deviceId from storage:', deviceId);
    } else {
      // 本地无 deviceId（未通过 BLE 配对），从云端自动发现
      this.setData({ deviceId: '发现中...' });
      this._discoverDeviceFromCloud();
    }
  },

  async _discoverDeviceFromCloud() {
    if (!wx.cloud) {
      this.setData({ deviceId: '未发现', statusText: '云开发未启用' });
      return;
    }
    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });
      const res = await db.collection('device_status')
        .where({ status: 'online' })
        .limit(1)
        .get();
      if (res.data && res.data.length > 0) {
        const deviceId = res.data[0].device_id;
        if (deviceId) {
          this._deviceId = deviceId;
          this.setData({ deviceId });
          // 回写到本地存储，下次直接用
          wx.setStorageSync('deviceId', deviceId);
          logger.log('[calibrate] deviceId from cloud:', deviceId);
          return;
        }
      }
      this.setData({ deviceId: '未发现', statusText: '未发现在线设备' });
      logger.log('[calibrate] no device found in cloud');
    } catch (e) {
      logger.error('[calibrate] discover device error:', e);
      this.setData({ deviceId: '未发现', statusText: '请先在network页面连接设备' });
    }
  },

  _checkCloudStatus() {
    if (wx.cloud) {
      this.setData({ connected: true });
      // 如果本地无 deviceId 且还没发起过云发现，重试
      if (!this._deviceId) {
        this._discoverDeviceFromCloud();
      }
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
    if (this._commandSent) {
      logger.warn('[calibrate] _startRelaxPhase ignored: command already sent');
      return;
    }
    this._commandSent = true;
    this._calibStartTs = Date.now();

    wx.removeStorageSync('calib_data');
    this.setData({
      phase: 'relax',
      statusText: '请保持放松...',
      liveRelaxRms: null,
      liveRelaxMdf: null,
      relaxRms: null,
      relaxMdf: null,
      activeRms: null,
      activeMdf: null,
      endMdf: null,
      saved: false,
    });

    try {
      await this._sendCommand('record_relax');
      logger.log('[calibrate] record_relax sent');
    } catch (e) {
      logger.error('[calibrate] send record_relax failed:', e);
      wx.showToast({ title: '发送失败', icon: 'none' });
      this._commandSent = false;
      this._resetAll();
      return;
    }

    this._setPhaseTimeout(20, '放松校准超时，请重试');
    this._startPolling();
  },

  async _startActivePhase() {
    if (this._commandSent) {
      logger.warn('[calibrate] _startActivePhase ignored: command already sent');
      return;
    }
    this._commandSent = true;

    this.setData({
      phase: 'active_contract',
      statusText: '请全力握紧拳头，保持15秒！',
      liveActiveRms: null,
      liveActiveMdf: null,
    });

    try {
      await this._sendCommand('record_active');
      logger.log('[calibrate] record_active sent');
    } catch (e) {
      logger.error('[calibrate] send record_active failed:', e);
      wx.showToast({ title: '发送失败', icon: 'none' });
      this._commandSent = false;
      this._resetAll();
      return;
    }

    this._setPhaseTimeout(30, '主动收缩校准超时，请重试');
    this._startPolling();
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

  _clearPhaseTimeout() {
    if (this._phaseTimeout) {
      clearTimeout(this._phaseTimeout);
      this._phaseTimeout = null;
    }
  },

  _setPhaseTimeout(seconds, timeoutMsg) {
    this._clearPhaseTimeout();
    this._phaseStartTs = Date.now();
    this._phaseTimeout = setTimeout(() => {
      logger.warn('[calibrate] phase timeout after', seconds, 's');
      this._stopPolling();
      this._commandSent = false;
      this.setData({
        phase: 'idle',
        statusText: timeoutMsg || '校准超时，请重试',
      });
      wx.showToast({ title: timeoutMsg || '校准超时', icon: 'none' });
    }, seconds * 1000);
  },

  async _pollCalibStatus() {
    if (!wx.cloud || !this._deviceId) return;

    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });

      let session = null;

      const res = await db.collection('sessions')
        .where({ device_id: this._deviceId, status: 'calibrating' })
        .orderBy('started_at', 'desc')
        .limit(1)
        .get();

      logger.log('[calibrate] poll: found', res.data ? res.data.length : 0, 'calibrating sessions');

      if (res.data && res.data.length > 0) {
        session = res.data[0];
      } else {
        const res2 = await db.collection('sessions')
          .where({ device_id: this._deviceId, status: 'completed' })
          .orderBy('started_at', 'desc')
          .limit(1)
          .get();
        if (res2.data && res2.data.length > 0) {
          session = res2.data[0];
          logger.log('[calibrate] poll: found completed session instead');
        }
      }

      if (session) {
        logger.log('[calibrate] poll session.calibration:', JSON.stringify(session.calibration));
        logger.log('[calibrate] session started_at:', session.started_at, 'calibStartTs:', this._calibStartTs);

        if (session.calibration) {
          const { relax_rms, relax_mdf, active_rms, active_mdf, end_mdf } = session.calibration;

          logger.log('[calibrate] poll fields: relax_rms=' + relax_rms,
            'active_rms=' + active_rms,
            'this.relaxRms=' + this.data.relaxRms,
            'this.activeRms=' + this.data.activeRms);

          const isNewSession = session.started_at >= this._calibStartTs - 5000;

          if (isNewSession && relax_rms !== undefined && relax_rms > 0 && !active_rms && !this.data.relaxRms) {
            this._clearPhaseTimeout();
            this._commandSent = false;
            this.setData({
              relaxRms: relax_rms,
              relaxMdf: relax_mdf || 0,
              phase: 'active_ready',
              statusText: '放松校准完成，请握紧拳头至最大力，准备好了就点击下方按钮',
            });
            this._stopPolling();
            return;
          }

          if (isNewSession && active_rms !== undefined && active_rms > 0 && !this.data.activeRms) {
            this._clearPhaseTimeout();
            this._commandSent = false;
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
    this._clearPhaseTimeout();
    this._commandSent = false;
    this.setData({
      phase: 'idle',
      statusText: '点击下方按钮开始校准',
      validation: null,
      saved: false,
      liveRelaxRms: null,
      liveRelaxMdf: null,
      liveActiveRms: null,
      liveActiveMdf: null,
      relaxRms: null,
      relaxMdf: null,
      activeRms: null,
      activeMdf: null,
      endMdf: null,
    });
  },

  // ==================== 用户表单 ====================
  onShowUserForm() {
    this.setData({ showUserForm: true });
  },

  onHideUserForm() {
    this.setData({ showUserForm: false });
  },

  // 阻止弹窗内事件冒泡到遮罩层
  onNoop() {},

  // 输入框聚焦时确保可视
  onInputFocus() {
    // 弹窗锚定在 flex-start，键盘弹起时 mask 自身 overflow-y:auto 会自动可滚动
    // 此处仅做兜底：将页面滚动到顶部，防止底层页面滚动干扰
    wx.pageScrollTo({ scrollTop: 0, duration: 150 });
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

  onGoToMonitor() {
    wx.switchTab({ url: '/pages/realtime/index' });
  },
});
