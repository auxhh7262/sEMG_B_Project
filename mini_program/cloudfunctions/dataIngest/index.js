// 云函数 dataIngest — 固件 HTTP POST 批量上传特征值数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

const BATCH_MAX = 100; // 单次最多写入 100 条

// 字段顺序固定：[timestamp_sec, rms*1000, act*10, mdf*10, fatigue*10, quality]
// timestamp_sec 是固件 NTP 同步后的 UTC 秒数
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
    const serverNowMs = Date.now();

    let written = 0;

    for (let i = 0; i < points.length; i += BATCH_MAX) {
      const batch = points.slice(i, i + BATCH_MAX);
      const batchDocs = batch.map((point, idx) => {
        const [tsSec, rmsRaw, actRaw, mdfRaw, fatigueRaw, qualityRaw] = point;

        // timestamp: UTC 毫秒（供 orderBy 排序）
        let timestamp;
        if (tsSec > 1700000000) {
          // 固件 NTP 时间戳有效（> 2023-11-14），每帧间隔约 100ms
          timestamp = tsSec * 1000 + (i + idx) * 100;
        } else {
          timestamp = serverNowMs + (i + idx) * 100;
        }

        // timeStr: 北京时间字符串 HH:MM:SS.sss
        // 纯算术计算，避开 Date 构造函数的所有时区陷阱
        const beijingSec = (tsSec > 1700000000) ? (tsSec + 8 * 3600) : 0;
        let timeStr = '--:--:--';
        if (beijingSec > 0) {
          const h = Math.floor(beijingSec / 3600) % 24;
          const m = Math.floor(beijingSec / 60) % 60;
          const s = beijingSec % 60;
          const ms = (i + idx) * 100; // 帧偏移毫秒
          timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
        }

        return {
          timestamp,
          timeStr,
          rms: rmsRaw || 0,
          activation: actRaw || 0,
          mdf: mdfRaw || 0,
          fatigue: fatigueRaw || 0,
          quality: qualityRaw || 0,
          created_at: serverNowMs
        };
      });

      // 逐条 add + 并发写入（微信云 add 不支持数组批量）
      await Promise.all(batchDocs.map(doc => coll.add({ data: doc })));
      written += batchDocs.length;
    }

    return { code: 0, msg: 'ok', written };
  } catch (e) {
    console.error('[dataIngest]', e);
    return { code: 500, msg: e.message };
  }
};
