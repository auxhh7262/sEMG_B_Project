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