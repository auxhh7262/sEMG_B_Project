// 云函数 sendDeviceCommand — 小程序发送命令到设备
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  // HTTP 访问服务: body 是 JSON 字符串; SDK 调用: event 是解析后的对象
  const body = (typeof event.body === 'string') ? JSON.parse(event.body) : event;
  const { device_id, command, params = {} } = body;

  if (!device_id || !command) {
    return { code: 400, msg: 'missing device_id or command' };
  }

  try {
    // 写入待执行命令
    const res = await db.collection('device_commands').add({
      data: {
        device_id,
        command,
        params,
        status: 'pending',      // pending / executing / done / failed
        created_at: Date.now(),
        executed_at: null,
      }
    });

    console.log('[sendDeviceCommand]', device_id, command, res._id);
    return { code: 0, msg: 'ok', command_id: res._id };
  } catch (e) {
    console.error('[sendDeviceCommand]', e);
    return { code: 500, msg: e.message };
  }
};
