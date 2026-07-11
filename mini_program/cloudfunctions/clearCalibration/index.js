// 云函数 clearCalibration — 清除云端 sessions 集合中该设备的校准数据
// 小程序"清除校准"时调用：与固件 EEPROM、本地缓存共同构成"三处一致清除"
//
// 清除后 getCalibration 仅返回 status='completed' 且 calibration.relax_rms 非空的记录，
// 由于本函数移除了 calibration 字段，getCalibration 将返回 404（无校准），
// 实时页/校准页恢复时即判定为"无校准"，不再从云端把旧校准拉回来。
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const device_id = event.device_id;
  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    // 移除该设备所有校准相关 session 的 calibration 字段
    // sessions 集合仅由 uploadCalibration 写入（calibrating/completed/cancelled），
    // 实时监测数据在 data_points 集合，不受影响。
    const res = await db.collection('sessions')
      .where({
        device_id: _.eq(device_id),
        status: _.in(['completed', 'calibrating', 'cancelled'])
      })
      .update({
        data: { calibration: _.remove() }
      });

    const updated = res.stats ? res.stats.updated : 0;
    console.log('[clearCalibration] removed calibration for', device_id, 'updated=', updated);
    return { code: 0, msg: 'ok', updated };
  } catch (e) {
    console.error('[clearCalibration]', e);
    return { code: 500, msg: e.message };
  }
};
