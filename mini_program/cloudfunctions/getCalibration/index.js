// 云函数 getCalibration — 从 sessions 集合读取最近校准数据
// 解决客户端直接读取 sessions 集合的权限问题
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  let device_id = event.device_id;

  // 如果没有传 device_id，尝试从 data_points 发现
  if (!device_id) {
    try {
      const dpRes = await db.collection('data_points')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      if (dpRes.data.length > 0 && dpRes.data[0].device_id) {
        device_id = dpRes.data[0].device_id;
        console.log('[getCalibration] device_id discovered:', device_id);
      } else {
        return { code: 404, msg: 'no device found' };
      }
    } catch (e) {
      console.error('[getCalibration] discover device failed:', e);
      return { code: 500, msg: e.message };
    }
  }

  try {
    // 查询该设备最近一次完成的校准 session
    const res = await db.collection('sessions')
      .where({ device_id: _.eq(device_id), status: 'completed' })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();

    if (res.data.length === 0) {
      return { code: 404, msg: 'no completed calibration' };
    }

    const session = res.data[0];
    const calib = session.calibration;

    if (!calib || calib.relax_rms == null) {
      return { code: 404, msg: 'calibration data incomplete' };
    }

    return {
      code: 0,
      msg: 'ok',
      device_id,
      calibration: {
        relax_rms: calib.relax_rms,
        relax_mdf: calib.relax_mdf || 0,
        active_rms: calib.active_rms || 0,
        active_mdf: calib.active_mdf || 0,
        end_mdf: calib.end_mdf || 0,
      },
      updated_at: session.updated_at || 0,
    };
  } catch (e) {
    console.error('[getCalibration]', e);
    return { code: 500, msg: e.message };
  }
};
