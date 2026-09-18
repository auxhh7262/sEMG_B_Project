// ============================================================
// 云函数: getProfile — 阶段3 云端精炼画像拉取
// 架构层: 查询层（sessions 集合最近 completed 基线）
// 触发方: 固件 NetManager.fetchProfile() HTTP POST（会话启动后一次）
// HTTP路径: POST /getProfile
// 输入: device_id（可选，不传则自动发现最近设备）
// 当前策略: 直接取最近一次 completed session 校准值（2026-07-11 修订）
//   原因: 多 session 聚合会把握持姿态/接触压力伪迹混入，污染基线
//   本地 uploadCalibration 上传 → 云端最近 = 本地 EEPROM 校准
// 返回: { code:0, relax_rms/MDF, active_rms/MDF, end_mdf, sessions_used:1 }
// 集合: sessions
// 修订历史（保留原文，详见下方）：
// ============================================================
//
// 重要修订（2026-07-11）：
// 原先对最近 20 次 completed session 做中位数聚合 + "采纳更高 active_rms 峰值"。
// 但实测发现同一设备在不同时期校准时握持姿态/电极接触压力差异很大
// （手掌张开 vs 握拳、接触压力伪迹使 RMS 相差 10 倍以上），
// 这些差异并非真实肌肉力，却被聚合进基线，导致：
//   1) 中位数被旧脏校准（高接触压力）拖高；
//   2) "采纳更高峰值"逻辑会主动把脏数据往高里拉（active_rms 被顶到 ~202），
//   3) 每次开机 fetchProfile 用这个污染值覆盖 EEPROM 里刚做的好校准。
// 因此改为【直接采用最近一次 completed session 的校准值】：
//   - 本地每次校准都会 uploadCalibration 上传 → 云端最近一次 = 本地 EEPROM 校准；
//   - 开机回灌与本地校准一致，不会被历史脏数据覆盖；
//   - 用户重新校准后，下一次重启自然拉到最新校准。
// 后续若要恢复"越用越稳健"的纵向聚合，应先按握持姿态/接触压力聚类过滤后再聚合（TODO）。
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // 兼容 POST body 与 GET query
  let device_id = event.device_id ||
    (event.queryStringParameters && event.queryStringParameters.device_id);

  if (!device_id) {
    try {
      const res = await db.collection('sessions')
        .orderBy('updated_at', 'desc')
        .limit(1)
        .get();
      if (res.data.length > 0 && res.data[0].device_id) {
        device_id = res.data[0].device_id;
      } else {
        return { code: 404, msg: 'no device found' };
      }
    } catch (e) {
      console.error('[getProfile] discover device failed:', e);
      return { code: 500, msg: e.message };
    }
  }

  try {
    // 取最近一次 completed calibration session（与本地 EEPROM 校准同源，避免历史脏数据覆盖）
    const res = await db.collection('sessions')
      .where({ device_id: _.eq(device_id), status: 'completed' })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();

    if (!res.data.length) {
      return { code: 404, msg: 'no completed calibration sessions' };
    }

    const cal = res.data[0].calibration;
    if (!cal || cal.relax_rms == null || cal.active_rms == null) {
      return { code: 404, msg: 'no calibration data' };
    }

    return {
      code: 0,
      msg: 'ok',
      device_id,
      relax_rms: cal.relax_rms,
      relax_mdf: cal.relax_mdf || 0,
      active_rms: cal.active_rms,
      active_mdf: cal.active_mdf || 0,
      end_mdf: cal.end_mdf || 0,
      sessions_used: 1,
    };
  } catch (e) {
    console.error('[getProfile]', e);
    return { code: 500, msg: e.message };
  }
};
