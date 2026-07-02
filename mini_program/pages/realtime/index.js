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
  },

  _historyRows: [],
  _relaxRms: null, _activeRms: null,
  _watcher: null,
  _starting: false,
  _sessionId: null,
  _tabVisible: false,
  _lastRenderTime: 0,

  // ==== 兜底轮询相关 ====
  _pollTimer: null,
  _watchActive: false,      // watch 当前是否活跃
  _lastWatchDataMs: 0,      // 上次 watch 推送数据的时间
  _lastPollTs: 0,           // 上次轮询拿到的最新 timestamp，防重复

  onLoad() {
    log('[realtime] Cloud onLoad');
    this._loadCalibFromCache();
    this._loadRecentHistory();
    this._startWatch();
  },

  onShow() {
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
            quality: res.data[0].quality != null ? res.data[0].quality + '%' : '--',
            timeStr: rows[rows.length - 1] ? rows[rows.length - 1].time : '--'
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
          if (!this._tabVisible) return;
          const docs = snapshot.docs;
          if (docs && docs.length > 0) {
            this._onDataPoint(docs[0]);
          }
        },
        onError: (e) => {
          error('[realtime] Watch error:', e);
          this._watchActive = false;
          // 3 秒后自动重连
          setTimeout(() => {
            log('[realtime] Watch reconnecting...');
            this._stopWatch();
            this._startWatch();
          }, 3000);
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

    const actPct = pt.activation != null ? Math.max(0, Math.min(100, pt.activation / 10)) : null;
    const fatPct = pt.fatigue != null ? Math.max(0, Math.min(100, pt.fatigue / 10)) : null;

    return {
      time: timeStr,
      rms: (pt.rms / 1000 || 0).toFixed(3),
      act: actPct != null ? actPct.toFixed(1) + '%' : '--',
      mdf: (pt.mdf / 10 || 0).toFixed(1),
      fat: fatPct != null ? fatPct.toFixed(1) + '%' : '--',
      q: pt.quality != null ? pt.quality + '%' : '--'
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
          quality: pt.quality != null ? pt.quality + '%' : '--',
          timeStr: histRow.time,
          connected: true
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
      }
    } catch (_) {}
  },
});
