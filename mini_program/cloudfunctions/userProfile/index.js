// 云函数 userProfile — 保存/读取用户个人信息（解决删除重装后丢失）
// action: 'save' | 'get'
// save: { action, name, age, gender, handedness }
// get:  { action } → { code:0, name, age, gender, handedness }
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d4gqmimmo05b12c94' });
const db = cloud.database();
const _ = db.command;

// 安全查询：集合不存在时不报错，返回空数组
async function safeQuery(collection, where) {
  try {
    return await db.collection(collection).where(where).limit(1).get();
  } catch (e) {
    console.log('[userProfile] query (collection may not exist):', e.message);
    return { data: [] };
  }
}

exports.main = async (event, context) => {
  const wxCtx = cloud.getWXContext();
  const OPENID = wxCtx.OPENID;
  console.log('[userProfile] event:', JSON.stringify(event), 'openid:', OPENID ? 'yes' : 'no');
  
  if (!OPENID) return { code: 401, msg: 'no openid' };

  // ---- 保存 ----
  if (event.action === 'save') {
    const { name, age, gender, handedness } = event;
    if (!name) return { code: 400, msg: 'missing name' };

    const now = Date.now();
    try {
      const existing = await safeQuery('users', { openid: _.eq(OPENID) });

      if (existing.data && existing.data.length > 0) {
        await db.collection('users').doc(existing.data[0]._id).update({
          data: { name, age, gender, handedness, updated_at: now }
        });
        console.log('[userProfile] updated for', OPENID);
      } else {
        const addRes = await db.collection('users').add({
          data: { openid: OPENID, name, age, gender, handedness, created_at: now, updated_at: now }
        });
        console.log('[userProfile] created for', OPENID, 'id:', addRes._id);
      }
      return { code: 0, msg: 'ok' };
    } catch (e) {
      console.error('[userProfile] save error:', e);
      return { code: 500, msg: e.message };
    }
  }

  // ---- 读取 ----
  try {
    const res = await safeQuery('users', { openid: _.eq(OPENID) });

    if (!res.data || res.data.length === 0) {
      return { code: 404, msg: 'not found' };
    }

    const u = res.data[0];
    return {
      code: 0,
      msg: 'ok',
      name: u.name,
      age: u.age,
      gender: u.gender,
      handedness: u.handedness,
    };
  } catch (e) {
    console.error('[userProfile] get error:', e);
    return { code: 500, msg: e.message };
  }
};
