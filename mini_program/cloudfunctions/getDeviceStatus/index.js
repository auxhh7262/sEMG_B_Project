// 云函数 getDeviceStatus — 小程序读取设备最新状态
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  // HTTP 访问服务: body 是 JSON 字符串; SDK 调用: event 是解析后的对象
  const body = (typeof event.body === 'string') ? JSON.parse(event.body) : event;
  const { device_id } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    const { data } = await db.collection('device_status')
      .where({ device_id })
      .orderBy('last_report', 'desc')
      .limit(1)
      .get();

    if (data.length === 0) {
      return { code: 404, msg: 'device not found' };
    }

    const status = data[0];
    console.log('[getDeviceStatus]', device_id, status.ip, status.ssid);

    return {
      code: 0,
      msg: 'ok',
      data: {  // [FIX] 统一使用 data 字段，与小程序 _getStatusFromCloud 对齐
        ip: status.ip || '',
        ssid: status.ssid || '',
        status: status.status || 'offline',
        last_report: status.last_report || 0,
        updated_at: status.last_report || 0,
      }
    };
  } catch (e) {
    console.error('[getDeviceStatus]', e);
    return { code: 500, msg: e.message };
  }
};
