// 云函数 uploadCalibration — 固件上传校准结果到 sessions 集合
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  let body = {};
  try {
    if (typeof event.body === 'string' && event.body.trim() !== '') {
      body = JSON.parse(event.body);
    } else {
      body = event;
    }
  } catch (e) {
    return { code: 400, msg: 'invalid JSON body' };
  }

  const { device_id, phase, rms, mdf, end_mdf } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  // 固件发送通用字段 rms/mdf，根据 phase 映射为具体字段
  const relax_rms = (phase === 'relax') ? rms : undefined;
  const relax_mdf = (phase === 'relax') ? mdf : undefined;
  const active_rms = (phase === 'active') ? rms : undefined;
  const active_mdf = (phase === 'active') ? mdf : undefined;

  try {
    const coll = db.collection('sessions');
    const now = Date.now();

    // 查找该设备最近的未完成 session
    const { data } = await coll
      .where({ device_id, status: 'calibrating' })
      .orderBy('started_at', 'desc')
      .limit(1)
      .get();

    if (phase === 'relax' && relax_rms !== undefined) {
      // relax 阶段：总是创建新 session，同时把旧的 calibrating session 标记为 cancelled
      if (data.length > 0) {
        await coll.doc(data[0]._id).update({
          data: { status: 'cancelled', updated_at: now }
        });
        console.log('[uploadCalibration] cancelled old session', data[0]._id);
      }
      const doc = {
        device_id,
        status: 'calibrating',
        calibration: { relax_rms, relax_mdf },
        started_at: now,
        updated_at: now,
      };
      const res = await coll.add({ data: doc });
      console.log('[uploadCalibration] created new session (relax)', res._id);

    } else if (phase === 'active' && active_rms !== undefined) {
      // active 阶段：更新最近的 calibrating session
      if (data.length > 0) {
        const session = data[0];
        const updateData = {
          updated_at: now,
          calibration: {
            ...session.calibration,
            active_rms, active_mdf, end_mdf: end_mdf || 0,
          },
          status: 'completed',
          ended_at: now,
        };
        await coll.doc(session._id).update({ data: updateData });
        console.log('[uploadCalibration] updated session (active)', session._id);
      } else {
        // 没有找到 calibrating session，直接创建 completed session
        const doc = {
          device_id,
          status: 'completed',
          calibration: {
            relax_rms: 0, relax_mdf: 0,
            active_rms, active_mdf, end_mdf: end_mdf || 0,
          },
          started_at: now,
          updated_at: now,
          ended_at: now,
        };
        const res = await coll.add({ data: doc });
        console.log('[uploadCalibration] created session (active-only)', res._id);
      }
    }

    return { code: 0, msg: 'ok' };
  } catch (e) {
    console.error('[uploadCalibration]', e);
    return { code: 500, msg: e.message };
  }
};
