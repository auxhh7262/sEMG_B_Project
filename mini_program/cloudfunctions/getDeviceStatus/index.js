// HTTP 云函数 getDeviceStatus
// 访问路径: POST https://cloud1-d4gqmimmo05b12c94.service.tcloudbase.com/getDeviceStatus
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  // HTTP 触发器的请求体会放在 event.body 里（字符串）
  // 需要手动解析 JSON
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { code: 400, msg: 'invalid json body' };
  }

  const { device_id } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    // 从 device_status 集合查询最新状态
    const res = await db.collection('device_status')
      .where({ device_id })
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (res.data.length === 0) {
      return { code: 404, msg: 'device not found', online: false };
    }

    const status = res.data[0];

    // 判断设备是否在线（最后上报时间在 60 秒内）
    const now = Date.now();
    const isOnline = (now - status.timestamp) < 60000;

    return {
      code: 0,
      msg: 'ok',
      data: {
        online: isOnline,
        ip: status.ip || '',
        ssid: status.ssid || '',
        timestamp: status.timestamp,
        firmware_version: status.firmware_version || '',
      }
    };
  } catch (e) {
    console.error('[getDeviceStatus]', e);
    return { code: 500, msg: e.message };
  }
};
