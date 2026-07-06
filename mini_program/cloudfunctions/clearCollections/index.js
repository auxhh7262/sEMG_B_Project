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