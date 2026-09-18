// utils/storage.js — 本地存储工具（wx.storage 单用户版）
// 职责: 封装用户画像 / 当前用户 / 设备ID 的 wx.storage 读写
// 说明: 小程序 wx.storage 为本地快照缓存；权威校准数据在固件 EEPROM + 云端云函数
// 存储键:
//   - 'current_user': 当前用户对象 {name, age, gender, handedness}
//   - 'user_profile': 用户画像持久化（同 current_user 结构）
//   - 'deviceId':     设备ID（BLE 配网后缓存）
//   - 'calib_data':   校准数据快照 {relax_rms, relax_mdf, active_rms, active_mdf, end_mdf}
// 导出函数: getCurrentUser / setCurrentUser / saveCurrentUser / loadUserProfile /
//          clearUserProfile / getDeviceId / clearDeviceId / getAgeGroup

function getCurrentUser() {
  return wx.getStorageSync('current_user') || null;
}

function setCurrentUser(user) {
  if (!user) return;
  wx.setStorageSync('current_user', user);
}

function saveCurrentUser(user) {
  if (!user) return;
  wx.setStorageSync('user_profile', user);
  wx.setStorageSync('current_user', user);
}

function loadUserProfile() {
  return wx.getStorageSync('user_profile') || null;
}

function clearUserProfile() {
  wx.removeStorageSync('user_profile');
  wx.removeStorageSync('current_user');
}

function getDeviceId() {
  return wx.getStorageSync('deviceId') || '';
}

function clearDeviceId() {
  wx.removeStorageSync('deviceId');
}

function getAgeGroup(age) {
  if (age < 18) return 0;  // <18
  if (age <= 35) return 1; // 18-35
  if (age <= 55) return 2; // 36-55
  return 3;                 // 56+
}

module.exports = {
  getCurrentUser,
  setCurrentUser,
  saveCurrentUser,
  loadUserProfile,
  clearUserProfile,
  getDeviceId,
  clearDeviceId,
  getAgeGroup,
};
