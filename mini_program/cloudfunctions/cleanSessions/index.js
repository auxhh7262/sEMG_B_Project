// 云函数 cleanSessions — 清理历史脏校准 session（校准法修正后，旧姿态/异常值的 completed session 已无参考价值）
// 用法：微信开发者工具右键本函数「上传并部署：云端安装依赖」，然后「测试调用」并传入 {confirm:true}
//       可选 device_id 仅清理指定设备；不传则清理全部设备。
// 注意：这是破坏性操作（删除 sessions 集合中 status='completed' 的记录），仅清理校准历史，不影响其它集合。
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // 安全防护：必须显式传 confirm=true 才执行删除，避免误触发（默认 dry-run 只返回待删数量）
  if (event.confirm !== true) {
    try {
      const c = await db.collection('sessions')
        .where(_.and([
          { status: 'completed' },
          event.device_id ? { device_id: event.device_id } : {}
        ]))
        .count();
      return { code: 400, msg: 'dry-run: 请带 {confirm:true} 调用以执行删除', toDelete: c.total };
    } catch (e) {
      return { code: 500, msg: e.message };
    }
  }

  try {
    const whereChain = _.and([
      { status: 'completed' },
      event.device_id ? { device_id: event.device_id } : {}
    ]);
    const countRes = await db.collection('sessions').where(whereChain).count();
    const total = countRes.total;
    if (total === 0) {
      return { code: 0, msg: 'no completed sessions to clean', deleted: 0 };
    }

    let deleted = 0;
    let guard = 0;
    while (deleted < total && guard < 50) {
      guard++;
      const res = await db.collection('sessions').where(whereChain).limit(100).get();
      if (!res.data.length) break;
      for (const doc of res.data) {
        await db.collection('sessions').doc(doc._id).remove();
        deleted++;
      }
    }
    return { code: 0, msg: 'ok', deleted };
  } catch (e) {
    console.error('[cleanSessions]', e);
    return { code: 500, msg: e.message };
  }
};
