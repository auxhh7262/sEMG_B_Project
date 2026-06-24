// 云函数 dataIngest — 固件 HTTP POST 批量上传特征值数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

const BATCH_MAX = 100; // 单次最多写入 100 条

exports.main = async (event, context) => {
  console.log('[dataIngest] RAW event:', JSON.stringify(event));

  // ========== 兼容 HTTP 网关 + SDK 调用 ==========
  let body = {};
  try {
    if (typeof event.body === 'string' && event.body.trim() !== '') {
      body = JSON.parse(event.body);
    } else {
      body = event;
    }
  } catch (e) {
    console.error('[dataIngest] JSON parse error:', e);
    return { code: 400, msg: 'invalid JSON body' };
  }

  const { session_id, device_id, points } = body;

  if (!session_id || !points || !Array.isArray(points)) {
    return { code: 400, msg: 'missing session_id or points array' };
  }

  try {
    const coll = db.collection('data_points');

    // 分批写入（微信云单次最多 100 条）
    let written = 0;
    for (let i = 0; i < points.length; i += BATCH_MAX) {
      const batch = points.slice(i, i + BATCH_MAX);
      const ops = batch.map(p => coll.add({
        data: {
          session_id,
          device_id: device_id || '',
          timestamp: p.ts,
          rms: p.rms || 0,
          act: p.act || 0,
          mdf: p.mdf || 0,
          fatigue: p.fatigue || 0,
          quality: p.quality || 0,
          created_at: Date.now()
        }
      }));
      await Promise.all(ops);
      written += batch.length;
    }

    return { code: 0, msg: 'ok', written };
  } catch (e) {
    console.error('[dataIngest]', e);
    return { code: 500, msg: e.message };
  }
};