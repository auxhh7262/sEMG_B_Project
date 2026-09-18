// ============================================================
// 云函数: deviceRegister — 固件设备注册/更新到 devices 集合
// 架构层: 写入层（devices 集合 upsert）
// 触发方: 固件开机/首次上线
// HTTP路径: POST /deviceRegister
// 输入 (JSON): device_id, firmware_ver='v2.0.0'
// 逻辑: device_id 存在 → update(last_seen, firmware_ver); 不存在 → add
// 集合: devices
// 返回: { code:0, msg:'registered'|'updated' }
// ============================================================
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();

exports.main = async (event, context) => {
  console.log('[deviceRegister] RAW event:', JSON.stringify(event));

  let body = {};
  try {
    if (typeof event.body === 'string' && event.body.trim() !== '') {
      body = JSON.parse(event.body);
    } else {
      body = event;
    }
  } catch (e) {
    return { code: 400, msg: 'invalid JSON body' };
  }

  const { device_id, firmware_ver = 'v2.0.0' } = body;
  if (!device_id) return { code: 400, msg: 'missing device_id' };

  try {
    const coll = db.collection('devices');
    const { data } = await coll.where({ device_id }).get();

    if (data.length > 0) {
      await coll.doc(data[0]._id).update({
        data: { last_seen: db.serverDate(), firmware_ver }
      });
      return { code: 0, msg: 'updated' };
    } else {
      await coll.add({
        data: {
          device_id,
          firmware_ver,
          created_at: db.serverDate(),
          last_seen: db.serverDate()
        }
      });
      return { code: 0, msg: 'registered' };
    }
  } catch (e) {
    console.error('[deviceRegister]', e);
    return { code: 500, msg: e.message };
  }
};