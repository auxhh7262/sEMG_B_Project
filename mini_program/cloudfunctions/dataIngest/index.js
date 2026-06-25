// 云函数 dataIngest — 固件 HTTP POST 批量上传特征值数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

const BATCH_MAX = 100; // 单次最多写入 100 条

// 字段顺序固定：[rms, activation, mdf, fatigue, quality]
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

  const { points } = body;

  if (!points || !Array.isArray(points)) {
    return { code: 400, msg: 'missing points array' };
  }

  try {
    const coll = db.collection('data_points');
    const serverTime = Date.now();
    const now = serverTime;

    // 分批写入（微信云单次最多 100 条）
    let written = 0;

    for (let i = 0; i < points.length; i += BATCH_MAX) {
      const batch = points.slice(i, i + BATCH_MAX);
      const ops = batch.map((point, idx) => {
        // point 格式固定：[rms*1000, activation*10, mdf*10, fatigue*10, quality]
        const [rmsRaw, activationRaw, mdfRaw, fatigueRaw, qualityRaw] = point;
        const timestamp = now + (i + idx) * 100; // 每帧间隔 100ms
        return coll.add({
          data: {
            timestamp,
            rms: rmsRaw || 0,              // 存原始整数（×1000），页面负责 /1000 显示
            activation: activationRaw || 0,  // 存原始整数（×10）
            mdf: mdfRaw || 0,              // 存原始整数（×10）
            fatigue: fatigueRaw || 0,      // 存原始整数（×10）
            quality: qualityRaw || 0,
            created_at: now
          }
        });
      });
      await Promise.all(ops);
      written += batch.length;
    }

    return { code: 0, msg: 'ok', written };
  } catch (e) {
    console.error('[dataIngest]', e);
    return { code: 500, msg: e.message };
  }
};
