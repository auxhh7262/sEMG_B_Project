// pages/realtime/index.js — 实时监测页面
const app = getApp();
const { log, warn, error } = require('../../utils/logger');

const MAX_HISTORY = 5;
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';
const POLL_INTERVAL = 2000;    // 轮询间隔 2s（watch 真机不触发时的兜底）
const WATCH_TIMEOUT = 15000;   // watch 超过 15s 无数据则启动轮询

Page({
  data: {
    connected: false,
    quality: '--',
    timeStr: '--:--:--',
    historyRows: [],
    algorithm: '无校准',
    scrollIntoId: 'row-0',
    wearWarning: false,   // 电极开路/未佩戴提示
  },

  _historyRows: [],
  _relaxRms: null, _activeRms: null,
  _watcher: null,
  _starting: false,
  _sessionId: null,
  _tabVisible: false,
  _calibRestoring: false,
  _lastRenderTime: 0,
  _watchRetryDelay: 0,

  // ==== 兜底轮询相关 ====
  _pollTimer: null,
  _watchActive: false,      // watch 当前是否活跃
  _lastWatchDataMs: 0,      // 上次 watch 推送数据的时间
  _lastPollTs: 0,           // 上次轮询拿到的最新 timestamp，防重复

  onLoad() {
    log('[realtime] Cloud onLoad');
    wx.setNavigationBarTitle({ title: 'sEMG疲劳预警' });
    this._initDeviceId();
    this._loadCalibFromCache();
    this._loadRecentHistory();
    this._startWatch();
  },

  // 本地无 deviceId（如删除重装）时，先从云端发现在线设备并缓存，
  // 保证后续校准恢复/数据查询都能用真实 deviceId，不依赖不稳定的 data_points 发现
  _initDeviceId() {
    const deviceId = wx.getStorageSync('deviceId') || '';
    if (!deviceId && wx.cloud) {
      this._discoverDeviceFromCloud();
    }
  },

  onShow() {
    setTimeout(() => wx.setNavigationBarTitle({ title: 'sEMG疲劳预警' }), 50);
    this._tabVisible = true;
    this._loadCalibFromCache();
    if (!this._watcher) this._startWatch();
    this._startPolling();
  },

  onHide() {
    this._tabVisible = false;
    this._stopPolling();
  },

  onUnload() {
    this._stopPolling();
    this._stopWatch();
  },

  // ==================== 历史数据加载 ====================
  _loadRecentHistory() {
    if (!wx.cloud) return;
    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });
      db.collection('data_points')
        .orderBy('timestamp', 'desc')
        .limit(MAX_HISTORY)
        .get()
        .then(res => {
          if (!res.data || res.data.length === 0) return;
          // 逆序：从旧到新
          const rows = res.data.reverse().map(pt => this._formatRow(pt));
          this._historyRows = rows;
          // 记录最新 timestamp 用于后续轮询去重
          const last = res.data[0];
          if (last && last.timestamp) {
            this._lastPollTs = last.timestamp;
          }
          this.setData({
            historyRows: rows.slice(),
            scrollIntoId: 'row-' + (rows.length - 1),
            quality: rows[rows.length - 1] ? rows[rows.length - 1].q : '--',
            timeStr: rows[rows.length - 1] ? rows[rows.length - 1].time : '--',
            wearWarning: rows[rows.length - 1] ? (rows[rows.length - 1].worn === false) : false
          });
          log('[realtime] Loaded %d history rows, _lastPollTs=%s', rows.length, this._lastPollTs);
        })
        .catch(e => warn('[realtime] loadHistory failed:', e));
    } catch (e) {
      warn('[realtime] loadHistory error:', e);
    }
  },

  // ==================== Cloud DB Watch ====================
  _startWatch() {
    if (this._watcher || this._starting) return;
    this._starting = true;

    if (!wx.cloud) {
      warn('[realtime] wx.cloud not available');
      this._starting = false;
      return;
    }

    this._ensureCloudReady().then(() => {
      if (this._watcher) {
        this._starting = false;
        return;
      }
      const db = wx.cloud.database({ env: CLOUD_ENV });
      this.setData({ connected: true });
      this._watchDataPoints(db);
    }).catch(e => {
      error('[realtime] Cloud not ready:', e);
      this.setData({ connected: false });
    }).finally(() => {
      this._starting = false;
    });
  },

  _ensureCloudReady() {
    return new Promise((resolve, reject) => {
      let retry = 0;
      const check = () => {
        try {
          const db = wx.cloud.database({ env: CLOUD_ENV });
          if (db) {
            log('[realtime] Cloud ready');
            resolve();
          } else {
            throw new Error('db is null');
          }
        } catch (e) {
          retry++;
          if (retry > 10) {
            reject(new Error('Cloud init timeout'));
          } else {
            setTimeout(check, 500);
          }
        }
      };
      check();
    });
  },

  _watchDataPoints(db) {
    this._watcher = db.collection('data_points')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .watch({
        onChange: (snapshot) => {
          this._watchActive = true;
          this._lastWatchDataMs = Date.now();
          this._watchRetryDelay = 0;
          if (!this._tabVisible) return;
          const docs = snapshot.docs;
          if (docs && docs.length > 0) {
            this._onDataPoint(docs[0]);
          }
        },
        onError: (e) => {
          error('[realtime] Watch error:', e);
          this._watchActive = false;
          this._watchRetryDelay = this._watchRetryDelay === 0 ? 5000 : Math.min(this._watchRetryDelay * 2, 30000);
          setTimeout(() => {
            log('[realtime] Watch reconnecting...');
            this._stopWatch();
            this._startWatch();
          }, this._watchRetryDelay);
        }
      });
    log('[realtime] Watch started');
  },

  _stopWatch() {
    if (this._watcher) {
      try { this._watcher.close(); } catch (_) {}
      this._watcher = null;
      this._watchActive = false;
      log('[realtime] Watcher closed');
    }
  },

  // ==================== 兜底轮询 ====================
  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(() => this._pollOnce(), POLL_INTERVAL);
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  _pollOnce() {
    if (!wx.cloud) return;
    if (!this._tabVisible) return;

    const now = Date.now();
    // watch 活跃且在超时内，跳过轮询
    if (this._watchActive && (now - this._lastWatchDataMs < WATCH_TIMEOUT)) {
      return;
    }

    log('[realtime] Poll started (watch inactive for %d ms)', now - this._lastWatchDataMs);
    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });
      db.collection('data_points')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get()
        .then(res => {
          if (!res.data || res.data.length === 0) return;
          const doc = res.data[0];
          if (doc.timestamp && doc.timestamp === this._lastPollTs) return; // 无新数据
          this._lastPollTs = doc.timestamp;
          this._onDataPoint(doc);
          log('[realtime] Poll got new data, ts=%s', doc.timestamp);
        })
        .catch(e => warn('[realtime] Poll query failed:', e));
    } catch (e) {
      warn('[realtime] Poll error:', e);
    }
  },

  // ==================== Data Processing ====================
  _formatRow(pt) {
    let timeStr = '--';
    if (pt.timeStr) {
      timeStr = pt.timeStr;
    } else if (pt.timestamp != null) {
      // 兜底：timestamp 是 UTC 毫秒，转换为北京时间
      const ts = pt.timestamp;
      const beijingMs = ts + 8 * 3600 * 1000;
      const d = new Date(beijingMs);
      timeStr = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}.${String(d.getUTCMilliseconds()).padStart(3,'0')}`;
    }

    const actPct = pt.activation != null ? Math.max(0, Math.min(100, pt.activation)) : null;
    const fatPct = pt.fatigue != null ? Math.max(0, Math.min(100, pt.fatigue)) : null;

    // 未佩戴/开路：固件已将质量分压到极低(3%)，直接用 quality 阈值判断
    // quality 缺失(旧数据)时默认视为已佩戴，避免误弹横幅
    const worn = pt.quality == null ? true : pt.quality >= 30;
    // 未校准（固件 m_isCalibrated=false，或云端校准已删除）：激活度/疲劳度无法计算，
    // 与"未佩戴"同口径统一显示 '--'；rms/mdf 为原始信号仍正常显示。
    // 旧数据缺 calibrated 字段时默认 true，避免历史已校准数据误显 '--'。
    const calibrated = pt.calibrated === false ? false : true;
    const hideCalib = (!worn) || (!calibrated);

    return {
      time: timeStr,
      rms: (pt.rms || 0).toFixed(3),
      // 未佩戴/未校准：激活度隐藏，用 '--' 占位（保持口径统一）
      act: (!hideCalib) ? (actPct != null ? actPct.toFixed(1) + '%' : '--') : '--',
      mdf: (pt.mdf || 0).toFixed(1),
      // 未佩戴/未校准：不显示虚假疲劳度/激活度，用 '--' 占位
      fat: (!hideCalib) ? (fatPct != null ? fatPct.toFixed(1) + '%' : '--') : '--',
      // 未佩戴：质量列提示佩戴状态
      q: (!worn) ? '请佩戴' : (pt.quality != null ? pt.quality + '%' : '--'),
      worn: worn
    };
  },

  _onDataPoint(pt) {
    try {
      const histRow = this._formatRow(pt);

      this._historyRows.unshift(histRow);
      if (this._historyRows.length > MAX_HISTORY) this._historyRows.pop();

      const now = Date.now();
      if (now - this._lastRenderTime >= 500) {
        this._lastRenderTime = now;
        this.setData({
          historyRows: this._historyRows.slice(),
          scrollIntoId: 'row-0',
          quality: histRow.q,
          timeStr: histRow.time,
          connected: true,
          // 电极开路/未佩戴：显示提示横幅（valid===0）
          wearWarning: histRow.worn === false
        });
      }

      log('[realtime] ' + histRow.time + ' rms=' + histRow.rms +
        ' act=' + histRow.act +
        ' mdf=' + histRow.mdf +
        ' fatigue=' + histRow.fat +
        ' q=' + histRow.q);
    } catch (e) {
      error('[realtime] _onDataPoint crash:', e);
    }
  },

  _loadCalibFromCache() {
    try {
      const c = wx.getStorageSync('calib_data');
      if (c?.relax_rms) {
        this._relaxRms = c.relax_rms;
        this._activeRms = c.active_rms;
        this.setData({ algorithm: '已校准' });
        return;
      }
    } catch (_) {}
    // 本地缓存为空（如删除重装），从云端恢复
    if (this._calibRestoring) return;   // 避免 onLoad/onShow 重复触发
    this._calibRestoring = true;
    this.setData({ algorithm: '恢复中...' });
    this._restoreCalibFromCloud(0);
  },

  // ==================== 设备发现 ====================
  // 本地无 deviceId（如删除重装）时，从云端 device_status 发现在线设备并缓存
  // 返回 Promise<deviceId>，失败时 resolve('') —— 防止 getCalibration 因
  // data_points 发现分支不可靠（集合为空时返回 404）而恢复失败
  _discoverDeviceFromCloud() {
    return new Promise((resolve) => {
      if (!wx.cloud) return resolve('');
      const db = wx.cloud.database({ env: CLOUD_ENV });
      db.collection('device_status')
        .where({ status: 'online' })
        .limit(1)
        .get()
        .then(res => {
          if (res.data && res.data.length > 0 && res.data[0].device_id) {
            const deviceId = res.data[0].device_id;
            wx.setStorageSync('deviceId', deviceId);
            log('[realtime] deviceId from cloud:', deviceId);
            resolve(deviceId);
          } else {
            log('[realtime] no device found in cloud');
            resolve('');
          }
        })
        .catch(e => {
          warn('[realtime] discover device error:', e);
          resolve('');
        });
    });
  },

  _restoreCalibFromCloud(retry = 0) {
    if (!wx.cloud) { this._calibRestoring = false; return; }
    const MAX_RETRY = 3;

    const query = (deviceId) => {
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
            };
            wx.setStorageSync('calib_data', calibData);
            if (res.result.device_id) {
              wx.setStorageSync('deviceId', res.result.device_id);
            }
            this._relaxRms = calib.relax_rms;
            this._activeRms = calib.active_rms;
            this._calibRestoring = false;
            this.setData({ algorithm: '已校准' });
            log('[realtime] calib restored from cloud:', calibData);
          } else if (retry < MAX_RETRY) {
            // 云端暂无可恢复数据或返回异常，延时重试（应对冷启动）
            log('[realtime] calib restore retry', retry + 1, res.result);
            setTimeout(() => this._restoreCalibFromCloud(retry + 1), 2000);
          } else {
            this._calibRestoring = false;
            this.setData({ algorithm: '无校准' });
            log('[realtime] no calib in cloud after retries:', res.result);
          }
        },
        fail: (e) => {
          warn('[realtime] getCalibration failed:', e);
          if (retry < MAX_RETRY) {
            setTimeout(() => this._restoreCalibFromCloud(retry + 1), 2000);
          } else {
            this._calibRestoring = false;
            this.setData({ algorithm: '无校准' });
          }
        },
      });
    };

    // 本地无 deviceId 时先从云端发现真实设备 ID，避免直接传 undefined 导致
    // getCalibration 走 data_points 发现分支返回 404（realtime 页面此前缺失此逻辑）
    const deviceId = wx.getStorageSync('deviceId') || '';
    if (!deviceId) {
      this._discoverDeviceFromCloud().then((id) => query(id));
    } else {
      query(deviceId);
    }
  },
});
