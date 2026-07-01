// pages/analysis/index.js — 疲劳度趋势分析页面
const { log, warn } = require('../../utils/logger');
const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';

Page({
  data: {
    isConnected: false,
    isLoading: false,
    isEmpty: true,
    errorMsg: '',

    dateRange: [],
    selectedRange: 'today',
    startDate: '',
    endDate: '',

    // 结论卡
    conclusion: {
      level: 'good',
      levelText: '表现良好',
      levelIcon: '🟢',
      peakText: '--',
      durationText: '--',
      suggestion: '',
    },

    // 摘要卡片
    summary: {
      duration: '--',
      avgFatigue: '--',
      maxFatigue: '--',
      peakTime: '--',
    },

    // 趋势分析
    trend: {
      type: 'stable',
      typeText: '稳定波动',
      description: '',
    },

    _chartPoints: [],
    _peakIndex: 0,
    _startTsMs: 0,
    _endTsMs: 0,
    totalMatches: 0,
    queryResultTip: '',
    statsInfo: null,
    exportPath: '',
    exportFileName: '',
    showShareBtn: false,
  },

  _chartCtx: null, _dpr: 1, _w: 0, _h: 0,
  _tabVisible: false,
  _chartRetries: 0,

  onLoad() {
    log('[analysis] onLoad');
    this._initDateRange();
    this._initCanvases();
  },
  onUnload() {},

  onShow() {
    log('[analysis] onShow');
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
    const threeDays = fmt(new Date(now - 864e5 * 3));
    const week = fmt(new Date(now - 864e5 * 7));
    const month = fmt(new Date(now - 864e5 * 30));
    this.setData({
      dateRange: [
        { key:'today', label:'今天', start:today, end:today },
        { key:'yesterday', label:'昨天', start:yesterday, end:yesterday },
        { key:'threeDays', label:'最近3天', start:threeDays, end:yesterday },
        { key:'week', label:'最近7天', start:week, end:yesterday },
        { key:'month', label:'最近30天', start:month, end:yesterday },
        { key:'custom', label:'自定义', start:'', end:'' },
      ],
      selectedRange: 'today', startDate: today, endDate: today,
      customStartDate: '', customEndDate: '',
      customStartTime: '', customEndTime: '',
    });
  },

  // ==================== Cloud Function Query ====================
  async _loadData() {
    if (this.data.isLoading) return;
    if (!wx.cloud) {
      this.setData({ isEmpty: true, errorMsg: '云开发未初始化' });
      return;
    }

    const { startDate, endDate, selectedRange, customStartTime, customEndTime } = this.data;
    if (!startDate || !endDate) {
      this.setData({ isLoading: false, errorMsg: '请选择查询日期范围' });
      return;
    }
    this.setData({ isLoading: true, errorMsg: '', isEmpty: false });

    try {
      let queryData = { startDate, endDate };
      // 在前端计算时间戳（手机端 UTC+8），避免云函数服务器时区偏差
      {
        const fmtDate = (d) => d.replace(/\//g, '-');
        const st = selectedRange === 'custom' ? (customStartTime || '00:00') : '00:00';
        const et = selectedRange === 'custom' ? ((customEndTime || '23:59') + ':59') : '23:59:59';
        queryData.startTs = new Date(fmtDate(startDate) + 'T' + st + ':00').getTime();
        queryData.endTs = new Date(fmtDate(endDate) + 'T' + et).getTime();
      }

      const res = await wx.cloud.callFunction({
        name: 'queryDataPoints',
        data: queryData
      });

      if (res.result.code !== 0) {
        throw new Error(res.result.msg);
      }

      const data = res.result.data;
      const total = res.result.total !== undefined ? res.result.total : data.length;
      const downsampled = res.result.downsampled || false;
      const firstTs = res.result.firstTs || (data.length > 0 ? data[0].timestamp : 0);
      const lastTs = res.result.lastTs || (data.length > 0 ? data[data.length - 1].timestamp : 0);
      const goodCount = res.result.goodCount || 0;
      const warnCount = res.result.warnCount || 0;
      const dangerCount = res.result.dangerCount || 0;
      if (!data || data.length === 0) {
        this.setData({ isLoading: false, isEmpty: true, errorMsg: '暂无监测数据' });
        return;
      }

      const DISPLAY_POINTS = 200; // 固定显示200个点
      let displayPts = data.map(d => ({
        fatigue: (d.fatigue || 0) / 10,
        timestamp: d.timestamp,
      }));

      // 如果数据量超过目标点数，做等间隔均匀采样
      if (displayPts.length > DISPLAY_POINTS) {
        const sampled = [];
        const step = displayPts.length / DISPLAY_POINTS;
        for (let i = 0; i < DISPLAY_POINTS; i++) {
          const idx = Math.min(Math.floor(i * step), displayPts.length - 1);
          sampled.push(displayPts[idx]);
        }
        displayPts = sampled;
      }

      const summary = this._calcSummary(displayPts, firstTs, lastTs);
      const conclusion = this._calcConclusion(displayPts, firstTs, lastTs);
      const trend = this._calcTrend(displayPts);

      const peakIdx = displayPts.reduce((maxIdx, p, i, arr) =>
        p.fatigue > arr[maxIdx].fatigue ? i : maxIdx, 0);

      const goodPct = total > 0 ? ((goodCount / total) * 100).toFixed(1) : '0.0';
      const warnPct = total > 0 ? ((warnCount / total) * 100).toFixed(1) : '0.0';
      const dangerPct = total > 0 ? ((dangerCount / total) * 100).toFixed(1) : '0.0';
      const statsInfo = {
        total,
        goodCount,
        goodPct,
        warnCount,
        warnPct,
        dangerCount,
        dangerPct,
      };

      this.setData({
        isLoading: false, isEmpty: false,
        summary, conclusion, trend, statsInfo,
        _chartPoints: displayPts,
        _peakIndex: peakIdx,
        _startTsMs: firstTs,
        _endTsMs: lastTs,
        totalMatches: total,
      });

      if (this._tabVisible) {
        let msg;
        if (downsampled || data.length > 200) {
          msg = '原始 ' + total + ' 条，显示 ' + displayPts.length + ' 点（降采样）';
        } else {
          msg = '共 ' + total + ' 条数据';
        }
        this.setData({ queryResultTip: msg });
      }

      setTimeout(async () => {
        await this._initCanvases();
        this._drawChart();
      }, 100);
    } catch (e) {
      warn('[analysis] _loadData error:', e);
      this.setData({ isLoading: false, isEmpty: true, errorMsg: e.message || '查询失败' });
    }
  },

  // ==================== 摘要计算 ====================
  _calcSummary(pts, firstTs, lastTs) {
    if (!pts.length) return { duration: '--', avgFatigue: '--', maxFatigue: '--', peakTime: '--' };

    const n = pts.length;
    const fatSum = pts.reduce((s, r) => s + (r.fatigue || 0), 0);
    const maxFat = Math.max(...pts.map(r => r.fatigue || 0));

    const peakIdx = pts.reduce((maxIdx, p, i, arr) =>
      p.fatigue > arr[maxIdx].fatigue ? i : maxIdx, 0);
    const peakTs = pts[peakIdx].timestamp;

    const durationMin = Math.round((lastTs - firstTs) / 60000);
    let durationText;
    if (durationMin < 1) {
      durationText = '< 1分钟';
    } else if (durationMin < 60) {
      durationText = durationMin + ' 分钟';
    } else {
      const h = Math.floor(durationMin / 60);
      const m = durationMin % 60;
      durationText = h + 'h ' + m + 'm';
    }

    const peakDate = new Date(peakTs);
    const peakTimeStr = `${peakDate.getMonth() + 1}/${String(peakDate.getDate()).padStart(2,'0')} ${String(peakDate.getHours()).padStart(2,'0')}:${String(peakDate.getMinutes()).padStart(2,'0')}`;

    return {
      duration: durationText,
      avgFatigue: Math.round(fatSum / n),
      maxFatigue: Math.round(maxFat),
      peakTime: peakTimeStr,
    };
  },

  // ==================== 结论卡计算 ====================
  _calcConclusion(pts, firstTs, lastTs) {
    if (!pts.length) {
      return {
        level: 'none', levelText: '暂无数据', levelIcon: '⚪',
        peakText: '--', durationText: '--',
        suggestion: '连接设备并开始监测，即可查看疲劳分析',
      };
    }

    const maxFat = Math.max(...pts.map(r => r.fatigue || 0));
    const durationMin = (lastTs - firstTs) / 60000;

    let level, levelText, levelIcon, suggestion;

    if (durationMin < 2) {
      level = 'none';
      levelText = '数据不足';
      levelIcon = '⚪';
      suggestion = '监测时长较短，建议继续监测以获得更准确的分析';
    } else if (maxFat < 30) {
      level = 'good';
      levelText = '状态正常';
      levelIcon = '🟢';
      suggestion = '肌肉疲劳度低，状态良好，可以继续保持当前运动强度';
    } else if (maxFat < 70) {
      level = 'warn';
      levelText = '轻度疲劳';
      levelIcon = '🟡';
      suggestion = '处于轻度疲劳状态，建议适当调整运动节奏，注意休息';
    } else {
      level = 'danger';
      levelText = '严重疲劳';
      levelIcon = '🔴';
      suggestion = '疲劳度已达较高水平，建议立即停止运动，充分休息恢复';
    }

    const durationText = durationMin < 1 ? '< 1分钟' :
      durationMin < 60 ? Math.round(durationMin) + ' 分钟' :
      Math.floor(durationMin / 60) + 'h ' + Math.round(durationMin % 60) + 'm';

    return {
      level, levelText, levelIcon,
      peakText: Math.round(maxFat) + '%',
      durationText,
      suggestion,
    };
  },

  // ==================== 趋势分析 ====================
  _calcTrend(pts) {
    if (!pts || pts.length < 10) {
      return { type: 'stable', typeText: '数据不足', description: '数据点较少，无法准确判断趋势' };
    }

    const n = pts.length;
    const firstHalf = pts.slice(0, Math.floor(n / 2));
    const secondHalf = pts.slice(Math.floor(n / 2));

    const avgFirst = firstHalf.reduce((s, r) => s + r.fatigue, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, r) => s + r.fatigue, 0) / secondHalf.length;

    const diff = avgSecond - avgFirst;
    const diffPct = (diff / Math.max(avgFirst, 1)) * 100;

    let type, typeText, description;

    if (Math.abs(diffPct) < 10) {
      type = 'stable';
      typeText = '稳定波动';
      description = '疲劳度整体保持稳定，波动范围在正常范围内';
    } else if (diffPct > 20) {
      type = 'rising';
      typeText = '持续上升';
      description = '疲劳度呈明显上升趋势，注意控制运动强度，适时休息';
    } else if (diffPct > 10) {
      type = 'rising_slow';
      typeText = '缓慢上升';
      description = '疲劳度缓慢上升，建议关注身体感受，合理安排运动量';
    } else if (diffPct < -20) {
      type = 'falling';
      typeText = '明显下降';
      description = '疲劳度下降明显，肌肉正在恢复，状态向好';
    } else {
      type = 'falling_slow';
      typeText = '缓慢下降';
      description = '疲劳度缓慢下降，身体处于恢复过程中';
    }

    // 找峰值位置
    const peakIdx = pts.reduce((maxIdx, p, i, arr) =>
      p.fatigue > arr[maxIdx].fatigue ? i : maxIdx, 0);
    const peakPos = peakIdx / n;

    if (type === 'stable') {
      description = '疲劳度整体保持稳定，波动范围在正常范围内';
    } else if (peakPos < 0.3 && type.startsWith('falling')) {
      description = '前期达到疲劳峰值后逐渐恢复，目前状态良好';
    } else if (peakPos > 0.7 && type.startsWith('rising')) {
      description = '疲劳度持续累积，后期达到峰值，建议及时休息';
    }

    return { type, typeText, description };
  },

  // ==================== Canvas Chart ====================
  _initCanvases() {
    return new Promise((resolve) => {
      const info = wx.getSystemInfoSync();
      const query = wx.createSelectorQuery();
      query.select('#fatigueChart').fields({ node: true, size: true }).exec(res => {
        if (!res[0]?.node) {
          resolve(false);
          return;
        }
        const c = res[0].node;
        const dpr = info.pixelRatio;
        c.width = res[0].width * dpr;
        c.height = res[0].height * dpr;
        const ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        this._chartCtx = ctx;
        this._dpr = dpr;
        this._w = res[0].width;
        this._h = res[0].height;
        resolve(true);
      });
    });
  },

  async _drawChart() {
    const ctx = this._chartCtx;
    const w = this._w;
    const h = this._h;
    if (!ctx || w === 0) {
      const success = await this._initCanvases();
      if (success) {
        setTimeout(() => this._drawChart(), 100);
      }
      return;
    }

    const pts = this.data._chartPoints;
    if (!pts || pts.length < 2) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('数据不足，无法绘制', w / 2, h / 2);
      return;
    }

    const values = pts.map(p => p.fatigue);
    const n = values.length;

    const pad = { top: 15, right: 12, bottom: 40, left: 45 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const toX = (i) => pad.left + (i / Math.max(n - 1, 1)) * cw;
    const toY = (v) => pad.top + (1 - v / 100) * ch;

    ctx.clearRect(0, 0, w, h);

    // 区域填充（绿色 0-30，橙色 30-70，红色 70-100）
    // 绿色区域 0-30
    ctx.fillStyle = 'rgba(7,193,96,0.06)';
    ctx.fillRect(pad.left, toY(30), cw, toY(0) - toY(30));
    // 橙色区域 30-70
    ctx.fillStyle = 'rgba(245,158,11,0.06)';
    ctx.fillRect(pad.left, toY(70), cw, toY(30) - toY(70));
    // 红色区域 70-100
    ctx.fillStyle = 'rgba(239,68,68,0.06)';
    ctx.fillRect(pad.left, toY(100), cw, toY(70) - toY(100));

    // 网格线
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch / 5) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // 30% 正常线（绿色虚线）
    ctx.strokeStyle = 'rgba(7,193,96,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(30));
    ctx.lineTo(w - pad.right, toY(30));
    ctx.stroke();
    ctx.setLineDash([]);

    // 70% 严重疲劳线（红色虚线）
    ctx.strokeStyle = 'rgba(239,68,68,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(70));
    ctx.lineTo(w - pad.right, toY(70));
    ctx.stroke();
    ctx.setLineDash([]);

    // Y轴标签（100在上，0在下）
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    [100, 80, 60, 40, 20, 0].forEach((val, i) => {
      ctx.fillText(val.toFixed(0), pad.left - 5, pad.top + (ch / 5) * i + 4);
    });

    // 时间标签（两行：第一行 HH:mm:ss.ms，第二行 M/DD）
    const fmtTime = (tsMs) => {
      const d = new Date(tsMs);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
    };
    const fmtDate = (tsMs) => {
      const d = new Date(tsMs);
      return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2,'0')}`;
    };
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    if (this.data._startTsMs) {
      ctx.fillText(fmtTime(this.data._startTsMs), pad.left, h - 20);
      ctx.fillText(fmtDate(this.data._startTsMs), pad.left, h - 6);
    }
    ctx.textAlign = 'right';
    if (this.data._endTsMs) {
      ctx.fillText(fmtTime(this.data._endTsMs), w - pad.right, h - 20);
      ctx.fillText(fmtDate(this.data._endTsMs), w - pad.right, h - 6);
    }

    // 绘制曲线（根据疲劳度变色）
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = toX(i), y = toY(values[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }

    // 渐变色：下绿(0-30%)→中橙(30-70%)→上红(70-100%)
    const gradient = ctx.createLinearGradient(0, toY(0), 0, toY(100));
    gradient.addColorStop(0, 'rgba(7,193,96,0.9)');
    gradient.addColorStop(0.3, 'rgba(7,193,96,0.9)');
    gradient.addColorStop(0.5, 'rgba(245,158,11,0.9)');
    gradient.addColorStop(0.7, 'rgba(239,68,68,0.9)');
    gradient.addColorStop(1, 'rgba(239,68,68,0.9)');
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // 填充区域
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.lineTo(toX(n - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96,165,250,0.06)';
    ctx.fill();

    // 峰值标注
    const peakIdx = this.data._peakIndex;
    const peakX = toX(peakIdx);
    const peakY = toY(values[peakIdx]);
    const peakVal = Math.round(values[peakIdx]);

    // 峰值点（大圆点）
    ctx.beginPath();
    ctx.arc(peakX, peakY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = peakVal >= 80 ? '#ef4444' : peakVal >= 60 ? '#f59e0b' : '#07c160';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 峰值标签
    const labelText = peakVal + '%';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const labelW = 36;
    const labelH = 18;
    let labelY = peakY - labelH - 6;
    if (labelY < pad.top + 2) labelY = peakY + 12;

    ctx.fillStyle = peakVal >= 80 ? 'rgba(239,68,68,0.9)' : peakVal >= 60 ? 'rgba(245,158,11,0.9)' : 'rgba(7,193,96,0.9)';
    ctx.beginPath();
    ctx.roundRect(peakX - labelW / 2, labelY - labelH + 4, labelW, labelH - 2, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(labelText, peakX, labelY);

    // 其他数据点
    const step = Math.max(1, Math.floor(n / 40));
    for (let i = 0; i < n; i += step) {
      if (i === peakIdx) continue;
      ctx.beginPath();
      ctx.arc(toX(i), toY(values[i]), 2, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa';
      ctx.fill();
    }
  },

  // ==================== Events ====================
  onRangeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const item = this.data.dateRange.find(r => r.key === key);
    if (!item) return;
    if (key === 'custom') {
      this.setData({ selectedRange: key });
    } else {
      this.setData({ selectedRange: key, startDate: item.start, endDate: item.end });
    }
  },

  onCustomStartChange(e) {
    const val = e.detail.value;
    this.setData({ customStartDate: val, startDate: val });
  },

  onCustomEndChange(e) {
    const val = e.detail.value;
    this.setData({ customEndDate: val, endDate: val });
  },

  onCustomStartTimeChange(e) {
    this.setData({ customStartTime: e.detail.value });
  },

  onCustomEndTimeChange(e) {
    this.setData({ customEndTime: e.detail.value });
  },

  onQuery() {
    this._loadData();
  },

  onShareToWechat() {
    const { exportPath, exportFileName } = this.data;
    if (!exportPath) { return; }
    wx.shareFileMessage({
      filePath: exportPath,
      fileName: exportFileName,
      success: () => {
        log('[analysis] share file success');
      },
      fail: (err) => {
        warn('[analysis] share file fail:', err);
        wx.showModal({
          title: '发送失败',
          content: '请手动打开微信文件传输助手，点击右下角"+"选择文件发送',
          confirmText: '知道了',
          showCancel: false
        });
      }
    });
  },

  async onExportData() {
    if (!wx.cloud) { wx.showToast({ title: '云开发未初始化', icon: 'none' }); return; }
    const { startDate, endDate, selectedRange, customStartTime, customEndTime } = this.data;

    // 同样在前端计算时间戳，保持和查询一致
    let queryData = { startDate, endDate, export: true, pageSize: 3000 };
    if (selectedRange === 'custom') {
      const st = customStartTime || '00:00';
      const et = (customEndTime || '23:59') + ':59';
      // 将日期中的斜杠替换为短横线，保证 JS Date 正确解析
      const fmtDate = (d) => d.replace(/\//g, '-');
      queryData.startTs = new Date(fmtDate(startDate) + 'T' + st + ':00').getTime();
      queryData.endTs = new Date(fmtDate(endDate) + 'T' + et).getTime();
    }

    wx.showLoading({ title: '正在查询数据...', mask: true });
    try {
      // ── 分批拉取所有数据 ──
      let allData = [];
      let cursorTs = 0;
      let total = 0;
      let batchNo = 0;
      let hasMore = true;

      while (hasMore) {
        queryData.cursorTs = cursorTs || undefined;
        const res = await wx.cloud.callFunction({
          name: 'queryDataPoints',
          data: queryData
        });

        if (res.result.code !== 0) {
          throw new Error(res.result.msg);
        }

        const batch = res.result.data || [];
        if (batchNo === 0) {
          total = res.result.total || batch.length;
          if (total === 0) {
            wx.hideLoading();
            wx.showToast({ title: '无数据可导出', icon: 'none' });
            return;
          }
        }

        allData = allData.concat(batch);
        hasMore = res.result.hasMore;
        if (batch.length > 0) {
          cursorTs = batch[batch.length - 1].timestamp;
        } else {
          hasMore = false;
        }

        batchNo++;
        wx.showLoading({
          title: `正在导出 ${allData.length}/${total} 条数据...`,
          mask: true
        });
      }

      // ── 生成 CSV ──
      const header = 'Timestamp,RMS(uV),Activation(%),MDF(Hz),Fatigue(%),Quality\n';
      const rows = allData.map(d => {
        const dt = new Date(d.timestamp);
        const ts = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}.${String(dt.getMilliseconds()).padStart(3,'0')}`;
        const rms = ((d.rms || 0) / 1000).toFixed(3);
        const activation = ((d.activation || 0) / 10).toFixed(1);
        const mdf = ((d.mdf || 0) / 10).toFixed(1);
        const fatigue = ((d.fatigue || 0) / 10).toFixed(1);
        const quality = d.quality || 0;
        return `${ts},${rms},${activation},${mdf},${fatigue},${quality}`;
      }).join('\n');

      const csv = header + rows;
      let name;
      if (selectedRange === 'custom') {
        const stFmt = (customStartTime || '00:00').replace(':', '');
        const etFmt = (customEndTime || '23:59').replace(':', '');
        name = `sEMG_${startDate}_${stFmt}-${endDate}_${etFmt}.csv`;
      } else {
        name = `sEMG_${startDate}_${endDate}.csv`;
      }
      const path = `${wx.env.USER_DATA_PATH}/${name}`;

      // ── 写入文件 ──
      try {
        const fs = wx.getFileSystemManager();
        await new Promise((resolve, reject) => {
          fs.writeFile({
            filePath: path,
            data: csv,
            encoding: 'utf8',
            success: resolve,
            fail: reject
          });
        });

        wx.hideLoading();

        const fileSize = (csv.length / 1024).toFixed(1);

        this.setData({
          exportPath: path,
          exportFileName: name,
          showShareBtn: true,
          queryResultTip: `已导出 ${allData.length} 条数据（${fileSize} KB），点击下方按钮发送到微信`
        });
      } catch (writeErr) {
        wx.hideLoading();
        warn('[analysis] write file error:', writeErr);
        wx.showToast({ title: '写入文件失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      warn('[analysis] export error:', e);
      let errMsg = '导出失败';
      if (e.message) {
        if (e.message.includes('timeout') || e.message.includes('超时')) {
          errMsg = '导出超时，请缩小时间范围';
        } else if (e.message.length < 30) {
          errMsg = '导出失败: ' + e.message;
        } else {
          errMsg = '导出失败，请重试';
        }
      }
      wx.showModal({
        title: '导出失败',
        content: errMsg + '\n' + (e.errMsg || e.message || ''),
        showCancel: false
      });
    }
  },
});
