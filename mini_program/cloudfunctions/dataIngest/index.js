// 云函数 dataIngest — 固件 HTTP POST 批量上传特征值数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

const BATCH_MAX = 100; // 单次最多写入 100 条

// 字段顺序固定：[timestamp_sec, ms, rms, act, mdf, fatigue, quality]
// 全部为真实物理值（rms:mV, act:%, mdf:Hz, fatigue:%），ms 为真实毫秒
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
        const [tsSec, msRaw, rmsRaw, actRaw, mdfRaw, fatigueRaw, qualityRaw, calibratedRaw] = point;
        // 校准状态：第 8 元素(1/0)。旧固件仅传 7 元素时无此字段 → 默认已校准，避免历史数据误显 '--'
        const calibrated = point.length > 7 ? (calibratedRaw === 1) : true;

        // timestamp: UTC 毫秒（供 orderBy 排序）
        const ms = Number.isFinite(msRaw) ? Math.max(0, Math.min(999, Math.floor(msRaw))) : 0;
        let timestamp;
        if (tsSec > 1700000000) {
          // 固件 NTP 时间戳有效（> 2023-11-14），使用真实毫秒
          timestamp = tsSec * 1000 + ms;
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
          calibrated,
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
