// 云函数 queryDataPoints
// 逻辑：游标分页取全量 → 云端 JS 均匀降采样 → 返回图表所需点数
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

const TARGET_POINTS = 2000; // 降采样目标点数
const BATCH = 100;          // 云函数端每次最多取 100 条

exports.main = async (event, context) => {
  const { startDate, endDate, targetPoints = TARGET_POINTS } = event;

  if (!startDate || !endDate) {
    return { code: 400, msg: 'missing startDate or endDate' };
  }

  try {
    const startTs = new Date(startDate + 'T00:00:00').getTime();
    const endTs = new Date(endDate + 'T23:59:59').getTime();

    // 第1步：查总数（用于决定是否需要降采样）
    const countRes = await db.collection('data_points')
      .where({
        timestamp: _.gte(startTs).and(_.lte(endTs))
      })
      .count();
    const total = countRes.total;
    if (total === 0) {
      return { code: 0, msg: 'ok', data: [], total: 0 };
    }

    // 第2步：游标分页取全量数据（用 timestamp 游标，无 skip 限制）
    let allData = [];
    let lastTs = startTs;
    let lastId = '';  // 处理同一毫秒内多条记录的去重

    while (true) {
      const batch = await db.collection('data_points')
        .where({
          timestamp: _.gte(lastTs).and(_.lte(endTs))
        })
        .orderBy('timestamp', 'asc')
        .limit(BATCH)
        .get();

      if (batch.data.length === 0) break;

      // 去掉与上一批重复的最后一条（游标去重）
      const toAdd = (allData.length === 0) ? batch.data :
        batch.data.filter(d => !(d.timestamp === lastTs && d._id === lastId));
      allData.push(...toAdd);

      // 更新游标
      const last = batch.data[batch.data.length - 1];
      lastTs = last.timestamp;
      lastId = last._id;

      // 如果这批数据量 < BATCH，说明已经取完
      if (batch.data.length < BATCH) break;

      // 安全上限：最多取 50000 条原始数据（再多处采样）
      if (allData.length >= 50000) break;
    }

    // 第3步：云端降采样（均匀采样）
    if (allData.length <= targetPoints) {
      return { code: 0, msg: 'ok', data: allData, total, downsampled: false };
    }

    const step = Math.floor(allData.length / targetPoints);
    const sampled = [];
    for (let i = 0; i < allData.length; i += step) {
      sampled.push(allData[i]);
    }
    // 确保最后一条也包含
    if (sampled[sampled.length - 1] !== allData[allData.length - 1]) {
      sampled.push(allData[allData.length - 1]);
    }

    return {
      code: 0, msg: 'ok',
      data: sampled,
      total,
      downsampled: true,
      kept: sampled.length
    };
  } catch (e) {
    console.error('[queryDataPoints]', e);
    return { code: 500, msg: e.message };
  }
};
