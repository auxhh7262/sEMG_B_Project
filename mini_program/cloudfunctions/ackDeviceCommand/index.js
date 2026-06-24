// 云函数 ackDeviceCommand — 固件确认命令执行完成
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  // HTTP 访问服务: body 是 JSON 字符串; SDK 调用: event 是解析后的对象
  const body = (typeof event.body === 'string') ? JSON.parse(event.body) : event;
  const { command_id, status = 'done' } = body;

  if (!command_id) {
    return { code: 400, msg: 'missing command_id' };
  }

  try {
    await db.collection('device_commands').doc(command_id).update({
      data: {
        status,
        executed_at: Date.now(),
      }
    });

    console.log('[ackDeviceCommand]', command_id, status);
    return { code: 0, msg: 'ok' };
  } catch (e) {
    console.error('[ackDeviceCommand]', e);
    return { code: 500, msg: e.message };
  }
};
