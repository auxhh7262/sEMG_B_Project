// 云函数 reportDeviceStatus — 固件上报设备状态（IP/SSID/在线状态）
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  // HTTP 访问服务: body 是 JSON 字符串; SDK 调用: event 是解析后的对象
  const body = (typeof event.body === 'string') ? JSON.parse(event.body) : event;
  const { device_id, ip, ssid, status = 'online', extra = {} } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    const coll = db.collection('device_status');
    const { data } = await coll.where({ device_id }).get();

    const now = Date.now();
    const doc = {
      device_id,
      ip: ip || '',
      ssid: ssid || '',
      status,
      last_report: now,
      ...extra,
    };

    if (data.length > 0) {
      // 更新已有记录
      await coll.doc(data[0]._id).update({ data: doc });
    } else {
      // 新增记录
      doc.created_at = now;
      await coll.add({ data: doc });
    }

    console.log('[reportDeviceStatus]', device_id, ip, ssid);
    return { code: 0, msg: 'ok' };
  } catch (e) {
    console.error('[reportDeviceStatus]', e);
    return { code: 500, msg: e.message };
  }
};
