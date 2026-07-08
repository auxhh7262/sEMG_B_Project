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
    formData: { name: '', age: '', gender: '1', handedness: '2' },

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
  _currentSessionId: null,
  _dataWatcher: null,
  _watchStarting: false,

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
    this._stopDataWatch();
  },

  onUnload() {
    this._stopPolling();
    this._stopDataWatch();
  },

  // ==================== 实时数据 Watch ====================
  _startDataWatch() {
    if (this._dataWatcher || this._watchStarting) return;
    if (!wx.cloud) return;
    this._watchStarting = true;

    const db = wx.cloud.database({ env: CLOUD_ENV });
    this._dataWatcher = db.collection('data_points')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .watch({
        onChange: (snapshot) => {
          const docs = snapshot.docs;
          if (docs && docs.length > 0) {
            const pt = docs[0];
            const { phase } = this.data;
            // 只接受校准阶段开始后的新数据，避免旧数据点污染显示
            const ptTime = pt.timestamp || pt.created_at || 0;
            if (this._phaseStartTs && ptTime < this._phaseStartTs - 5000) {
              return;  // 数据点比校准开始早5秒以上，跳过
            }
            if (phase === 'relax') {
              this.setData({
                liveRelaxRms: pt.rms ? pt.rms.toFixed(3) : null,
                liveRelaxMdf: pt.mdf ? pt.mdf.toFixed(1) : null,
              });
            } else if (phase === 'active_contract') {
              this.setData({
                liveActiveRms: pt.rms ? pt.rms.toFixed(3) : null,
                liveActiveMdf: pt.mdf ? pt.mdf.toFixed(1) : null,
              });
            }
          }
        },
        onError: (e) => {
          logger.warn('[calibrate] data watch error:', e);
        },
      });

    this._watchStarting = false;
  },

  _stopDataWatch() {
    if (this._dataWatcher) {
      this._dataWatcher.close();
      this._dataWatcher = null;
    }
    this._watchStarting = false;
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
      return;
    }
    // 本地为空（删除重装），从云端恢复
    if (!wx.cloud) return;
    if (this._userRestoring) return;
    this._userRestoring = true;
    this._restoreUserProfileFromCloud(0);
  },

  _restoreUserProfileFromCloud(retry = 0) {
    const MAX_RETRY = 3;
    wx.cloud.callFunction({
      name: 'userProfile',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.name) {
          const user = {
            name: res.result.name,
            age: res.result.age,
            gender: res.result.gender,
            handedness: res.result.handedness,
          };
          storage.setCurrentUser(user);
          storage.saveCurrentUser(user);
          this._userRestoring = false;
          this.setData({
            currentUser: user,
            userMetaStr: `${user.name} | ${user.age}岁 | ${user.gender === 1 ? '男' : '女'} | ${user.handedness === 1 ? '左手腕' : '右手腕'}`,
          });
          logger.log('[calibrate] user profile restored from cloud');
        } else if (retry < MAX_RETRY) {
          logger.log('[calibrate] userProfile restore retry', retry + 1, res.result);
          setTimeout(() => this._restoreUserProfileFromCloud(retry + 1), 2000);
        } else {
          this._userRestoring = false;
        }
      },
      fail: (e) => {
        logger.warn('[calibrate] userProfile get failed:', e);
        if (retry < MAX_RETRY) {
          setTimeout(() => this._restoreUserProfileFromCloud(retry + 1), 2000);
        } else {
          this._userRestoring = false;
        }
      },
    });
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
        return;
      }
    } catch (_) {}
    // 本地缓存为空，从云端恢复
    if (wx.cloud) {
      if (this._calibRestoring) return;
      this._calibRestoring = true;
      this.setData({ statusText: '校准数据恢复中...' });
      this._restoreCalibFromCloud(0);
    }
  },

  _restoreCalibFromCloud(retry = 0) {
    const MAX_RETRY = 3;
    const deviceId = wx.getStorageSync('deviceId') || '';
    wx.cloud.callFunction({
      name: 'getCalibration',
      data: { device_id: deviceId || undefined },
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.calibration) {
          const calib = res.result.calibration;
          const calibData = {
            relax_rms: calib.relax_rms,
            relax_mdf: calib.relax_mdf,
            active_rms: calib.active_rms,
            active_mdf: calib.active_mdf,
            end_mdf: calib.end_mdf || 0,
          };
          wx.setStorageSync('calib_data', calibData);
          if (res.result.device_id) {
            wx.setStorageSync('deviceId', res.result.device_id);
          }
          this._calibRestoring = false;
          this.setData({
            relaxRms: calib.relax_rms,
            relaxMdf: calib.relax_mdf || 0,
            activeRms: calib.active_rms,
            activeMdf: calib.active_mdf || 0,
            endMdf: calib.end_mdf || 0,
            saved: true,
            statusText: '已从云端恢复校准数据',
          });
          logger.log('[calibrate] calib restored from cloud:', calibData);
        } else if (retry < MAX_RETRY) {
          logger.log('[calibrate] calib restore retry', retry + 1, res.result);
          setTimeout(() => this._restoreCalibFromCloud(retry + 1), 2000);
        } else {
          this._calibRestoring = false;
          this.setData({ statusText: '未找到校准数据' });
        }
      },
      fail: (e) => {
        logger.warn('[calibrate] getCalibration failed:', e);
        if (retry < MAX_RETRY) {
          setTimeout(() => this._restoreCalibFromCloud(retry + 1), 2000);
        } else {
          this._calibRestoring = false;
          this.setData({ statusText: '校准数据恢复失败' });
        }
      },
    });
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
            this.onShowUserForm();
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
    this._currentSessionId = null;

    // 不删除本地 calib_data 缓存：如果用户中途放弃校准，旧数据仍保留
    // setData 已清空页面显示变量，不影响新校准的展示
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

    this._setPhaseTimeout(30, '放松校准超时，请重试');
    this._startDataWatch();
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
    this._startDataWatch();
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
      this._stopDataWatch();
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

      if (this._currentSessionId) {
        const res = await db.collection('sessions')
          .doc(this._currentSessionId)
          .get();
        session = res.data;
        logger.log('[calibrate] poll by sessionId:', this._currentSessionId, 'status:', session?.status);
      } else {
        const res = await db.collection('sessions')
          .where({ device_id: this._deviceId, status: 'calibrating' })
          .orderBy('started_at', 'desc')
          .limit(1)
          .get();

        if (res.data && res.data.length > 0) {
          session = res.data[0];
          this._currentSessionId = session._id;
          logger.log('[calibrate] found new calibrating session, tracking id:', session._id);
        }
      }

      if (session && session.calibration) {
        logger.log('[calibrate] poll session.calibration:', JSON.stringify(session.calibration));

        const { relax_rms, relax_mdf, active_rms, active_mdf, end_mdf } = session.calibration;

        logger.log('[calibrate] poll fields: relax_rms=' + relax_rms,
          'active_rms=' + active_rms,
          'this.relaxRms=' + this.data.relaxRms,
          'this.activeRms=' + this.data.activeRms);

        if (relax_rms !== undefined && relax_rms > 0 && !active_rms && !this.data.relaxRms) {
          this._clearPhaseTimeout();
          this._commandSent = false;
          this._stopDataWatch();
          this.setData({
            relaxRms: relax_rms,
            relaxMdf: relax_mdf || 0,
            phase: 'active_ready',
            statusText: '放松校准完成，请握紧拳头至最大力，准备好了就点击下方按钮',
          });
          this._stopPolling();
          return;
        }

        if (active_rms !== undefined && active_rms > 0 && !this.data.activeRms) {
          this._clearPhaseTimeout();
          this._commandSent = false;
          this._stopDataWatch();
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

    } catch (e) {
      logger.error('[calibrate] poll status error:', e);
    }
  },

  // ==================== 校验 ====================
  _validateResult() {
    const { relaxRms, relaxMdf, activeRms, activeMdf } = this.data;

    const rms_ok = activeRms > relaxRms * 2.0 && activeRms >= 0.5;
    const mdf_ok = relaxMdf >= 20 && relaxMdf <= 250 && (!activeMdf || (activeMdf >= 20 && activeMdf <= 250));

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
    this._stopDataWatch();
    this._clearPhaseTimeout();
    this._commandSent = false;
    this._currentSessionId = null;
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
    const user = storage.getCurrentUser() || {};
    this.setData({
      showUserForm: true,
      formData: {
        name: user.name || '',
        age: user.age ? String(user.age) : '',
        gender: user.gender ? String(user.gender) : '1',
        handedness: user.handedness ? String(user.handedness) : '2',
      },
    });
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
      userMetaStr: `${name} | ${age}岁 | ${user.gender === 1 ? '男' : '女'} | ${user.handedness === 1 ? '左手腕' : '右手腕'}`,
      showUserForm: false,
    });

    // 同步到云端（防止删除重装后丢失）
    if (wx.cloud) {
      wx.cloud.callFunction({
        name: 'userProfile',
        data: { action: 'save', ...user },
        success: (res) => {
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: '保存成功', icon: 'success' });
          } else {
            const msg = (res.result && res.result.msg) || '未知错误';
            wx.showToast({ title: '云端失败: ' + msg, icon: 'none', duration: 3000 });
          }
        },
        fail: (e) => {
          logger.warn('[calibrate] userProfile save failed:', e);
          wx.showToast({ title: '云函数调用失败: ' + (e.errMsg || JSON.stringify(e)), icon: 'none', duration: 3000 });
        },
      });
    } else {
      wx.showToast({ title: '保存成功', icon: 'success' });
    }
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
