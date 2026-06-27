// 云函数 getDeviceCommand — 固件短轮询获取待执行命令
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  console.log('[getDeviceCommand] RAW event:', JSON.stringify(event));

  // ========== 兼容 HTTP 网关 + SDK 调用（与 dataIngest 相同模式）==========
  let body = {};
  try {
    if (typeof event.body === 'string' && event.body.trim() !== '') {
      body = JSON.parse(event.body);
    } else {
      body = event;
    }
  } catch (e) {
    console.error('[getDeviceCommand] JSON parse error:', e);
    return { code: 400, msg: 'invalid JSON body' };
  }

  const { device_id } = body;

  if (!device_id) {
    return { code: 400, msg: 'missing device_id' };
  }

  try {
    // 查询该设备的 pending 命令（按创建时间升序，先到先执行）
    const coll = db.collection('device_commands');
    const { data } = await coll
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
    await coll.doc(cmd._id).update({
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
