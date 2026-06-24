// pages/realtime/index.js — Cloud Version
// 数据来源: 云数据库 data_points 集合 watcher (替代 WebSocket)
const app = getApp();
const { log, warn, error } = require('../../utils/logger');

const MAX_HISTORY = 5;
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

Page({
  data: {
    connected: false,
    quality: '--',
    timeStr: '--:--:--',
    historyRows: [],
    algorithm: '无校准',
    scrollIntoId: 'row-0',
  },

  _historyRows: [],
  _relaxRms: null, _activeRms: null,
  _watcher: null,
  _sessionId: null,
  _tabVisible: false,
  _lastRenderTime: 0,

  onLoad() {
    log('[realtime] Cloud onLoad');
    this._loadCalibFromCache();
    this._startWatch();
  },

  onShow() {
    this._tabVisible = true;
    this._loadCalibFromCache();
    if (!this._watcher) this._startWatch();
  },

  onHide() {
    this._tabVisible = false;
    // Don't close watcher — data keeps flowing, just skip rendering
  },

  onUnload() {
    this._stopWatch();
  },

  // ==================== Cloud DB Watch ====================
  _startWatch() {
    if (!wx.cloud) {
      warn('[realtime] wx.cloud not available');
      return;
    }

    const db = wx.cloud.database({ env: CLOUD_ENV });

    // 1. 获取当前活跃 session
    db.collection('sessions')
      .where({ status: 'active' })
      .orderBy('started_at', 'desc')
      .limit(1)
      .get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          this._sessionId = res.data[0].session_id;
          log('[realtime] Found active session:', this._sessionId);
          this.setData({ connected: true });
          this._watchDataPoints(db);
        } else {
          warn('[realtime] No active session found');
          this.setData({ connected: false });
        }
      })
      .catch(e => {
        error('[realtime] Failed to find session:', e);
        this.setData({ connected: false });
      });
  },

  _watchDataPoints(db) {
    if (!this._sessionId) return;

    // Watch data_points for current session
    this._watcher = db.collection('data_points')
      .where({
        session_id: this._sessionId
      })
      .orderBy('timestamp', 'desc')
      .limit(1)
      .watch({
        onChange: (snapshot) => {
          if (!this._tabVisible) return;
          const docs = snapshot.docs;
          if (docs && docs.length > 0) {
            this._onDataPoint(docs[0]);
          }
        },
        onError: (e) => {
          error('[realtime] Watch error:', e);
        }
      });
  },

  _stopWatch() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
      log('[realtime] Watcher closed');
    }
  },

  // ==================== Data Processing ====================
  _onDataPoint(pt) {
    try {
      const { timestamp: ts, rms, act, mdf, fatigue, quality } = pt;

      let timeStr = '--';
      if (ts != null) {
        const date = new Date(ts);
        timeStr = `${String(date.getHours()).padStart(2, '0')}:${
          String(date.getMinutes()).padStart(2, '0')}:${
          String(date.getSeconds()).padStart(2, '0')}`;
      }

      const actPct = act != null ? Math.max(0, Math.min(100, act)) : null;
      const fatPct = fatigue != null ? Math.max(0, Math.min(100, fatigue)) : null;

      const histRow = {
        time: timeStr,
        rms: (rms || 0).toFixed(3),
        act: actPct != null ? actPct.toFixed(1) + '%' : '--',
        mdf: (mdf || 0).toFixed(1),
        fat: fatPct != null ? fatPct.toFixed(1) + '%' : '--',
        q: quality != null ? quality + '%' : '--'
      };

      this._historyRows.unshift(histRow);
      if (this._historyRows.length > MAX_HISTORY) this._historyRows.pop();

      const now = Date.now();
      if (now - this._lastRenderTime >= 500) {
        this._lastRenderTime = now;
        this.setData({
          historyRows: this._historyRows.slice(),
          scrollIntoId: 'row-0',
          quality: quality != null ? quality + '%' : '--',
          timeStr,
          connected: true
        });
      }

      log('[realtime] ts=' + ts + ' rms=' + (rms || 0).toFixed(3) + 
        ' act=' + (actPct != null ? actPct.toFixed(1) + '%' : '--') +
        ' mdf=' + (mdf || 0).toFixed(1) +
        ' fatigue=' + (fatPct != null ? fatPct.toFixed(1) + '%' : '--'));
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
      }
    } catch (_) {}
  },
});
