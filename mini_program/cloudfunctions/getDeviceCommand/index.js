// 云函数 getDeviceCommand — 固件短轮询获取待执行命令
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // HTTP 访问服务: body 是 JSON 字符串; SDK 调用: event 是解析后的对象
  const body = (typeof event.body === 'string') ? JSON.parse(event.body) : event;
  const { device_id, last_command_id } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    // 查询该设备的 pending 命令（按创建时间升序，先到先执行）
    const { data } = await db.collection('device_commands')
      .where({
        device_id,
        status: 'pending',
      })
      .orderBy('created_at', 'asc')
      .limit(1)
      .get();

    if (data.length === 0) {
      return { code: 404, msg: 'no pending command' };
    }

    const cmd = data[0];
    console.log('[getDeviceCommand]', device_id, cmd.command, cmd._id);

    // 标记为 executing（防止重复执行）
    await db.collection('device_commands').doc(cmd._id).update({
      data: { status: 'executing', executing_at: Date.now() }
    });

    return {
      code: 0,
      msg: 'ok',
      command: {
        id: cmd._id,
        command: cmd.command,
        params: cmd.params || {},
        created_at: cmd.created_at,
      }
    };
  } catch (e) {
    console.error('[getDeviceCommand]', e);
    return { code: 500, msg: e.message };
  }
};
