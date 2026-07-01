const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const MAX_QUERY_POINTS = 2000; // 查询模式最多返回2000条，前端再采样
const EXPORT_PAGE_SIZE = 3000; // 导出模式每批3000条（游标分页）

exports.main = async (event, context) => {
  const { startDate, endDate, export: exportMode = false, startTs: directStartTs, endTs: directEndTs } = event;

  if (!startDate || !endDate) {
    return { code: 400, msg: 'missing startDate or endDate' };
  }

  try {
    let startTs, endTs;
    if (directStartTs !== undefined && directEndTs !== undefined) {
      startTs = directStartTs;
      endTs = directEndTs;
    } else {
      startTs = new Date(startDate + 'T00:00:00+08:00').getTime();
      endTs = new Date(endDate + 'T23:59:59+08:00').getTime();
    }
    const where = { timestamp: _.gte(startTs).and(_.lte(endTs)) };

    // ── 导出模式：游标分页，不走统计/首末/聚合 ──
    if (exportMode) {
      const pageSize = event.pageSize || EXPORT_PAGE_SIZE;
      const cursorTs = event.cursorTs; // 上一批最后一条的 timestamp

      // 首次调用时获取总数
      let total = 0;
      if (!cursorTs) {
        const countRes = await db.collection('data_points').where(where).count();
        total = countRes.total;
        if (total === 0) {
          return { code: 0, msg: 'ok', data: [], total: 0, hasMore: false, pageSize };
        }
      }

      let queryWhere = where;
      if (cursorTs) {
        queryWhere = { timestamp: _.gte(startTs).and(_.lte(endTs)).and(_.gt(cursorTs)) };
      }

      const res = await db.collection('data_points')
        .aggregate()
        .match(queryWhere)
        .sort({ timestamp: 1 })
        .limit(pageSize + 1) // 多取1条判断是否还有下一页
        .end();

      const hasMore = res.list.length > pageSize;
      const records = hasMore ? res.list.slice(0, pageSize) : res.list;

      const data = records.map(item => ({
        timestamp: item.timestamp,
        rms: item.rms,
        mdf: item.mdf,
        fatigue: item.fatigue,
        activity: item.activity,
        quality: item.quality
      }));

      return { code: 0, msg: 'ok', data, total, hasMore, pageSize };
    }

    // ── 查询模式：走完整统计 ──
    const countRes = await db.collection('data_points')
      .where(where)
      .count();
    const total = countRes.total;

    if (total === 0) {
      return { code: 0, msg: 'ok', data: [], total: 0, firstTs: 0, lastTs: 0, downsampled: false };
    }

    const firstRes = await db.collection('data_points')
      .where(where)
      .orderBy('timestamp', 'asc')
      .limit(1)
      .get();
    const lastRes = await db.collection('data_points')
      .where(where)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    const firstTs = firstRes.data[0]?.timestamp || 0;
    const lastTs = lastRes.data[0]?.timestamp || 0;

    // 统计各疲劳等级的真实数量
    const statsRes = await db.collection('data_points')
      .aggregate()
      .match(where)
      .group({
        _id: $.cond({
          if: $.lt(['$fatigue', 300]),
          then: 'good',
          else: $.cond({
            if: $.lt(['$fatigue', 700]),
            then: 'warn',
            else: 'danger'
          })
        }),
        count: $.sum(1)
      })
      .end();
    
    let goodCount = 0, warnCount = 0, dangerCount = 0;
    statsRes.list.forEach(item => {
      if (item._id === 'good') goodCount = item.count;
      else if (item._id === 'warn') warnCount = item.count;
      else if (item._id === 'danger') dangerCount = item.count;
    });

    // 使用聚合查询返回数据（不受100条限制）
    const res = await db.collection('data_points')
      .aggregate()
      .match(where)
      .sort({ timestamp: 1 })
      .limit(MAX_QUERY_POINTS)
      .end();

    const data = res.list.map(item => ({
      timestamp: item.timestamp,
      rms: item.rms,
      mdf: item.mdf,
      fatigue: item.fatigue,
      activity: item.activity,
      quality: item.quality
    }));

    const downsampled = total > MAX_QUERY_POINTS;

    return {
      code: 0, msg: 'ok',
      data,
      total,
      downsampled,
      kept: data.length,
      firstTs,
      lastTs,
      goodCount,
      warnCount,
      dangerCount,
    };
  } catch (e) {
    console.error('[queryDataPoints]', e);
    return { code: 500, msg: e.message };
  }
};
