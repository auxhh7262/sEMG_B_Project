import pathlib

f = pathlib.Path('E:/sEMG_B_Project/mini_program/pages/analysis/index.js')
content = f.read_text(encoding='utf-8')

# 找到 _loadData 函数的开始和结束位置
start_marker = '  // ==================== Cloud DB Query ====================\n  async _loadData() {'
end_marker = '  _calcSummary(pts) {'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print('ERROR: Could not find _loadData function')
    print('start_idx:', start_idx, 'end_idx:', end_idx)
    exit(1)

old_func = content[start_idx:end_idx]

new_func = '''  // ==================== Cloud Function Query ====================
  async _loadData() {
    if (this.data.isLoading) return;
    if (!wx.cloud) {
      this.setData({ isEmpty: true, errorMsg: '云开发未初始化' });
      return;
    }

    const { startDate, endDate } = this.data;
    this.setData({ isLoading: true, errorMsg: '', isEmpty: false });

    try {
      // 调用云函数查询数据（突破小程序端 20 条限制）
      const res = await wx.cloud.callFunction({
        name: 'queryDataPoints',
        data: {
          startDate,
          endDate,
          maxPoints: 5000
        }
      });

      if (res.result.code !== 0) {
        throw new Error(res.result.msg);
      }

      const data = res.result.data;
      if (!data || data.length === 0) {
        this.setData({ isLoading: false, isEmpty: true, errorMsg: '暂无监测数据' });
        return;
      }

      // 数据格式转换（云函数返回的数据已经是完整格式）
      const pts = data.map(d => ({
        mdf: (d.mdf || 0) / 10,          // MDF: 整数 → Hz（1位小数）
        fatigue: (d.fatigue || 0) / 10,  // Fatigue: 整数 → %（1位小数）
      }));

      const firstTs = data[0].timestamp;
      const lastTs = data[data.length - 1].timestamp;

      const summary = this._calcSummary(pts);

      this.setData({
        isLoading: false, isEmpty: false,
        summary,
        _chartPoints: pts,
        _startTsMs: firstTs,
        _endTsMs: lastTs,
        totalMatches: data.length,
      });

      if (this._tabVisible) {
        wx.showToast({ title: '共 ' + data.length + ' 条数据', icon: 'none', duration: 2000 });
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

'''

if old_func in content:
    content = content.replace(old_func, new_func)
    print('Replaced _loadData function successfully')
else:
    print('ERROR: old_func not found exactly')
    print('old_func length:', len(old_func))
    print('start_idx:', start_idx, 'end_idx:', end_idx)
    exit(1)

f.write_text(content, encoding='utf-8')
print('Done! File updated.')
