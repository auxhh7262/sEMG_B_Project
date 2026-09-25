// ============================================================
// 云函数: uploadCalibration — 固件分阶段上传校准结果
// 架构层: 写入层（sessions 集合校准入口）
// 触发方: 固件 NetManager.uploadCalibPhase()
// HTTP路径: POST /uploadCalibration
// 输入 (JSON):
//   device_id: 设备标识 "sEMG_XXXX"
//   phase:     "relax" | "active"
//   rms:       该阶段 RMS (mV)
//   mdf:       该阶段 MDF (Hz)
//   end_mdf:   仅 active 阶段传，用力结束 MDF (Hz)
// 会话生命周期:
//   - relax 阶段: 幂等复用/更新该设备最近的 calibrating session（更新 relax 字段），
//                 不新建、不把旧 session 标 cancelled（修复重试双发/跨校准残留破坏 session 的竞态）
//   - active 阶段: 找到最近 calibrating session → 补全 calibration → 状态变 completed
// 写入集合: sessions (calibrating → completed)
// 返回: { code:0 }
// ============================================================
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
      // relax 阶段：幂等复用该设备最近的 calibrating session（更新 relax 字段），
      // 不再创建新 session、也不再把旧 session 标 cancelled。
      // 修复：固件 HTTP 重试双发、或上一次校准残留的 calibrating session 都会导致
      // 旧逻辑「标旧 cancelled + 新建」破坏小程序正在绑定的 session，引发校准超时。
      if (data.length > 0) {
        const session = data[0];
        await coll.doc(session._id).update({
          data: {
            calibration: { ...session.calibration, relax_rms, relax_mdf },
            updated_at: now,
          }
        });
        console.log('[uploadCalibration] updated existing calibrating session (relax)', session._id);
      } else {
        const doc = {
          device_id,
          status: 'calibrating',
          calibration: { relax_rms, relax_mdf },
          started_at: now,
          updated_at: now,
        };
        const res = await coll.add({ data: doc });
        console.log('[uploadCalibration] created new session (relax)', res._id);
      }

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
