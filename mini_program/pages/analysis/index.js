// pages/analysis/index.js — Cloud Version
// 数据来源: 云数据库 data_points (替代 WebSocket query_cz)
const { log, warn } = require('../../utils/logger');
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

Page({
  data: {
    isConnected: false,
    isLoading: false,
    isEmpty: true,
    algorithm: '--',
    errorMsg: '',

    dateRange: [],
    selectedRange: 'today',
    startDate: '',
    endDate: '',

    summary: { avgMdf: '--', avgFatigue: '--', maxFatigue: '--', duration: '--' },
    _chartPoints: [],
    _startTsMs: 0,
    _endTsMs: 0,
    totalMatches: 0,
  },

  _chartCtxMdf: null, _dprMdf: 1, _wMdf: 0, _hMdf: 0,
  _chartCtxFat: null, _dprFat: 1, _wFat: 0, _hFat: 0,
  _tabVisible: false,

  onLoad() { this._initDateRange(); this._initCanvases(); },
  onUnload() {},

  onShow() {
    this._tabVisible = true;
    this._checkCloudStatus();
  },

  onHide() { this._tabVisible = false; },

  // ==================== Cloud Status ====================
  _checkCloudStatus() {
    if (wx.cloud) {
      this.setData({ isConnected: true });
    } else {
      this.setData({ isConnected: false });
    }
  },

  // ==================== Date Range ====================
  _initDateRange() {
    const now = new Date();
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today = fmt(now);
    const yesterday = fmt(new Date(now - 864e5));
    const week = fmt(new Date(now - 864e5 * 7));
    const month = fmt(new Date(now - 864e5 * 30));
    this.setData({
      dateRange: [
        { key:'today', label:'今天', start:today, end:today },
        { key:'yesterday', label:'昨天', start:yesterday, end:yesterday },
        { key:'week', label:'最近7天', start:week, end:today },
        { key:'month', label:'最近30天', start:month, end:today },
      ],
      selectedRange: 'today', startDate: today, endDate: today,
    });
  },

  // ==================== Cloud DB Query ====================
  async _loadData() {
    if (this.data.isLoading) return;
    if (!wx.cloud) {
      this.setData({ isEmpty: true, errorMsg: '云开发未初始化' });
      return;
    }

    const { startDate, endDate } = this.data;
    this.setData({ isLoading: true, errorMsg: '', isEmpty: false });

    try {
      const db = wx.cloud.database({ env: CLOUD_ENV });
      const startTs = new Date(startDate + 'T00:00:00').getTime();
      const endTs = new Date(endDate + 'T23:59:59').getTime();

      // Query data_points within date range
      const MAX_POINTS = 500;
      const res = await db.collection('data_points')
        .where({
          timestamp: db.command.gte(startTs).and(db.command.lte(endTs))
        })
        .orderBy('timestamp', 'asc')
        .limit(MAX_POINTS)
        .get();

      if (!res.data || res.data.length === 0) {
        this.setData({ isLoading: false, isEmpty: true, errorMsg: '暂无监测数据' });
        return;
      }

      const pts = res.data.map(d => ({
        mdf: d.mdf || 0,
        fatigue: d.fatigue || 0
      }));

      const firstTs = res.data[0].timestamp;
      const lastTs = res.data[res.data.length - 1].timestamp;

      const summary = this._calcSummary(pts);

      this.setData({
        isLoading: false, isEmpty: false,
        summary,
        _chartPoints: pts,
        _startTsMs: firstTs,
        _endTsMs: lastTs,
        totalMatches: res.data.length,
      });

      if (this._tabVisible) {
        wx.showToast({ title: '共 ' + res.data.length + ' 条数据', icon: 'none', duration: 2000 });
      }

      setTimeout(() => {
        this._drawOneChart('mdf');
        this._drawOneChart('fatigue');
      }, 100);
    } catch (e) {
      warn('[analysis] _loadData error:', e);
      this.setData({ isLoading: false, isEmpty: true, errorMsg: e.message || '查询失败' });
    }
  },

  _calcSummary(pts) {
    if (!pts.length) return { avgMdf: '--', avgFatigue: '--', maxFatigue: '--', duration: '--' };
    const n = pts.length;
    const mdfSum = pts.reduce((s, r) => s + (r.mdf || 0), 0);
    const fatSum = pts.reduce((s, r) => s + (r.fatigue || 0), 0);
    const maxFat = Math.max(...pts.map(r => r.fatigue || 0));
    return {
      avgMdf: (mdfSum / n).toFixed(1),
      avgFatigue: Math.round(fatSum / n),
      maxFatigue: Math.round(maxFat),
      duration: '--',
    };
  },

  // ==================== Canvas Charts (unchanged) ====================
  _initCanvases() {
    const info = wx.getSystemInfoSync();
    ['mdfChart', 'fatigueChart'].forEach(id => {
      const query = wx.createSelectorQuery();
      query.select('#' + id).fields({ node: true, size: true }).exec(res => {
        if (!res[0]?.node) return;
        const c = res[0].node;
        const dpr = info.pixelRatio;
        c.width = res[0].width * dpr;
        c.height = res[0].height * dpr;
        const ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        if (id === 'mdfChart') {
          this._chartCtxMdf = ctx; this._dprMdf = dpr;
          this._wMdf = res[0].width; this._hMdf = res[0].height;
        } else {
          this._chartCtxFat = ctx; this._dprFat = dpr;
          this._wFat = res[0].width; this._hFat = res[0].height;
        }
      });
    });
  },

  _drawOneChart(field) {
    const isMdf = field === 'mdf';
    const ctx = isMdf ? this._chartCtxMdf : this._chartCtxFat;
    const w   = isMdf ? this._wMdf : this._wFat;
    const h   = isMdf ? this._hMdf : this._hFat;
    if (!ctx || w === 0) return;

    const pts = this.data._chartPoints;
    if (!pts || pts.length < 2) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#666'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('数据不足，无法绘制', w / 2, h / 2);
      return;
    }

    const values = pts.map(p => p[field]);
    const vMin = Math.floor(Math.min(...values) / 10) * 10;
    const vMax = Math.ceil(Math.max(...values) / 10) * 10;
    const vRange = Math.max(vMax - vMin, 10);
    const n = values.length;

    const pad = { top: 15, right: 12, bottom: 28, left: 45 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const toX = (i) => pad.left + (i / Math.max(n - 1, 1)) * cw;
    const toY = (v) => pad.top + (1 - (v - vMin) / vRange) * ch;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    ctx.fillStyle = '#888'; ctx.font = '11px monospace'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = vMax - (vRange / 4) * i;
      ctx.fillText(val.toFixed(0), pad.left - 5, pad.top + (ch / 4) * i + 4);
    }

    const fmtTs = (tsMs) => {
      const d = new Date(tsMs);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
    };
    ctx.fillStyle = '#888'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    if (this.data._startTsMs) ctx.fillText(fmtTs(this.data._startTsMs), pad.left, h - 6);
    ctx.textAlign = 'right';
    if (this.data._endTsMs) ctx.fillText(fmtTs(this.data._endTsMs), w - pad.right, h - 6);

    const color = isMdf ? 'rgba(248,113,113,0.7)' : 'rgba(96,165,250,0.7)';
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = toX(i), y = toY(values[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.lineTo(toX(n - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = isMdf ? 'rgba(248,113,113,0.06)' : 'rgba(96,165,250,0.06)';
    ctx.fill();

    const step = Math.max(1, Math.floor(n / 40));
    const dotFill = isMdf ? '#f87171' : '#60a5fa';
    for (let i = 0; i < n; i += step) {
      ctx.beginPath(); ctx.arc(toX(i), toY(values[i]), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = dotFill; ctx.fill();
    }
    if (n > 1) {
      ctx.beginPath(); ctx.arc(toX(n - 1), toY(values[n - 1]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = dotFill; ctx.lineWidth = 1.5; ctx.stroke();
    }
  },

  // ==================== Events ====================
  onRangeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const item = this.data.dateRange.find(r => r.key === key);
    if (!item) return;
    this.setData({ selectedRange: key, startDate: item.start, endDate: item.end });
  },

  onQuery() {
    this._loadData();
  },

  onRefresh() {
    this._loadData();
  },

  onExportData() {
    const pts = this.data._chartPoints;
    if (!pts || !pts.length) { wx.showToast({ title: '无数据', icon: 'none' }); return; }
    const header = 'MDF(Hz),Fatigue(%)\n';
    const rows = pts.map(r => `${(r.mdf||0).toFixed(1)},${(r.fatigue||0).toFixed(1)}`).join('\n');
    const csv = header + rows;
    const name = `sEMG_${this.data.startDate}_${this.data.endDate}.csv`;
    const path = `${wx.env.USER_DATA_PATH}/${name}`;
    try {
      wx.getFileSystemManager().writeFileSync(path, csv, 'utf-8');
      wx.shareFileMessage({ filePath: path });
    } catch (e) {
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },
});
