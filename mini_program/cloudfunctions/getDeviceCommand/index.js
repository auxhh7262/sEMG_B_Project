// ============================================================
// 云函数: getDeviceCommand — 固件短轮询拉取待执行命令
// 架构层: 查询+状态转移（device_commands: pending→executing）
// 触发方: 固件 NetManager._checkCommand() 每 3s 调用
// HTTP路径: POST /getDeviceCommand
// 输入: device_id
// 逻辑: 按 created_at 升序(FIFO)取最早一条 pending 命令 → 立即 update 为 executing（防重复取）
//       选 FIFO 而非最新：校准流程 record_relax → record_active 必须有序
// 返回: { code:0, command:{ id, command, params, created_at } }
//       无待执行命令时返回 { code:404, msg:'no pending command' }
// 集合: device_commands
// 命令状态机: pending → executing → done(ackDeviceCommand)
// ============================================================
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
