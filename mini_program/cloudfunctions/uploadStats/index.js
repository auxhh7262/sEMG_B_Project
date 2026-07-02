// 云函数 uploadStats — 固件 HTTP POST 上传分钟统计数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  console.log('[uploadStats] RAW event:', JSON.stringify(event));

  // ========== 兼容 HTTP 网关 + SDK 调用 ==========
  let body = {};
  try {
    if (typeof event.body === 'string' && event.body.trim() !== '') {
      body = JSON.parse(event.body);
    } else {
      body = event;
    }
  } catch (e) {
    console.error('[uploadStats] JSON parse error:', e);
    return { code: 400, msg: 'invalid JSON body' };
  }

  const {
    device_id,
    timestamp,       // 秒级Unix时间戳
    rms_avg, rms_max, rms_min,
    mdf_avg, mdf_max,
    fatigue_avg, fatigue_max,
    quality_avg,
    count
  } = body;

  if (!device_id || timestamp === undefined) {
    return { code: 400, msg: 'missing device_id or timestamp' };
  }

  try {
    const coll = db.collection('stats_minutes');
    const now = Date.now();

    // timestamp转换为毫秒（固件上传的是秒级）
    const timestampMs = timestamp * 1000;

    await coll.add({
      data: {
        device_id,
        timestamp: timestampMs,
        rms_avg: rms_avg || 0,
        rms_max: rms_max || 0,
        rms_min: rms_min || 0,
        mdf_avg: mdf_avg || 0,
        mdf_max: mdf_max || 0,
        fatigue_avg: fatigue_avg || 0,
        fatigue_max: fatigue_max || 0,
        quality_avg: quality_avg || 0,
        count: count || 0,
        created_at: now
      }
    });

    console.log('[uploadStats] OK: device=%s, ts=%lu, count=%u',
                device_id, timestampMs, count);
    return { code: 0, msg: 'ok' };
  } catch (e) {
    console.error('[uploadStats]', e);
    return { code: 500, msg: e.message };
  }
};