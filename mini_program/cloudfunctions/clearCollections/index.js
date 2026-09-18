// ============================================================
// 云函数: clearCollections — 清空 data_points + sessions（运维工具）
// 架构层: 清理层（全集合重置）
// 用途: 开发调试/环境重置时一键清空两个核心集合
// 逻辑: limit(1000) 分批删除，直到 count=0
// 警告: 破坏性操作！无 confirm 保护（生产环境请移除此函数）
// 集合: data_points, sessions
// ============================================================
// 临时云函数：清空 data_points 和 sessions 集合
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

async function clearCollection(name) {
  let removed = 0;
  while (true) {
    const res = await db.collection(name).limit(1000).get();
    if (res.data.length === 0) break;
    await Promise.all(res.data.map(doc => db.collection(name).doc(doc._id).remove()));
    removed += res.data.length;
  }
  return removed;
}

exports.main = async (event, context) => {
  try {
    const dpRemoved = await clearCollection('data_points');
    const sessionRemoved = await clearCollection('sessions');
    console.log(`[clearCollections] removed data_points=${dpRemoved}, sessions=${sessionRemoved}`);
    return { code: 0, msg: 'ok', data: { dpRemoved, sessionRemoved } };
  } catch (e) {
    console.error('[clearCollections]', e);
    return { code: 500, msg: e.message };
  }
};