// pages/network/index.js — V3.0 Simplified Provisioning
// 对标小米/涂鸦 BLE 配网标准:
//   - BLE 连接后先读 deviceId (19B10005), 再写凭证
//   - 订阅 result 通知 (19B10006), 不再通过 IP 特征获取状态
//   - 配网成功后断开 BLE, 从云端 getDeviceStatus 获取 IP
//   - 设备 ID 以固件真实 deviceId 为准
//   - 删除 IP notify 特征 (19B10003) 相关逻辑

const { log, warn, error } = require('../../utils/logger');
const CLOUD_URL = 'https://cloud1-d4gqmimmo05b12c94.service.tcloudbase.com';

// BLE UUID 常量 (与固件 V3.0 一致)
const BLE_SERVICE_ID = '19B10000-E8F2-537E-4F6C-D104768A1214';
const CHAR_SSID      = '19B10001-E8F2-537E-4F6C-D104768A1214';
const CHAR_PASS      = '19B10004-E8F2-537E-4F6C-D104768A1214';
const CHAR_DEVICE_ID = '19B10005-E8F2-537E-4F6C-D104768A1214';  // V3.0 NEW
const CHAR_RESULT    = '19B10006-E8F2-537E-4F6C-D104768A1214';  // V3.0 NEW (replaces IP notify)

Page({
  data: {
    connected: false,
    configured: false,
    deviceId: '',
    ip: '',
    ssid: '',
    status: 'idle',       // idle | scanning | connecting | configuring | connected | failed
    statusMsg: '未连接',
    bleDeviceName: '',
    wifiSsids: [],        // 附近 WiFi 列表 (微信 API)
    wifiConnected: '',    // 当前手机连接 WiFi 的 SSID
    wifiPass: '',
    showPassInput: false,
    // 配网进度
    provisionStep: '',    // '' | 'connecting_ble' | 'writing_ssid' | 'writing_pass' | 'waiting_wifi' | 'done' | 'failed'
  },

  onLoad() {
    log('[network] Cloud onLoad');
    // 测试1: 直接发送到 /log 端点
    wx.request({
      url: 'http://192.168.137.1:9876/log',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { logs: [{ level: 'log', msg: '[NETWORK] TEST1 - direct /log POST', time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }] },
      success(res) { console.log('[NETWORK] TEST1 OK status=' + res.statusCode); },
      fail(err) { console.log('[NETWORK] TEST1 FAIL ' + err.errMsg); }
    });
    
    // 测试2: 发送到 /health 端点（确认网络通）
    wx.request({
      url: 'http://192.168.137.1:9876/health',
      method: 'GET',
      success(res) { console.log('[NETWORK] TEST2 health OK', res.data); },
      fail(err) { console.log('[NETWORK] TEST2 health FAIL', err.errMsg); }
    });
    console.log('[network] ========== 页面加载 ==========');
    console.log('[network] 测试日志 - 如果你能在GUI窗口看到这条消息，说明日志系统工作正常');
    
    this._deviceId = '';
    this._bleDeviceId = '';
    this._retryTimer = null;
    this._provisionTimeout = null;

    const savedSSID = wx.getStorageSync('lastWiFiSSID');
    if (savedSSID) {
      this.setData({ wifiConnected: savedSSID });
    }
  },

  onUnload() {
    log('[network] onUnload');
    this._cleanup();
  },

  // ==================== BLE 扫描 ====================
  startScan() {
    if (this._retryTimer) clearTimeout(this._retryTimer);

    this.setData({ status: 'scanning', statusMsg: '正在扫描设备...', provisionStep: '' });
    wx.closeBluetoothAdapter({
      success: () => {
        setTimeout(() => this._doScan(), 500);
      },
      fail: () => {
        this._doScan();
      }
    });
  },

  _doScan() {
    const that = this;
    wx.openBluetoothAdapter({
      success() {
        wx.startBluetoothDevicesDiscovery({
          services: [BLE_SERVICE_ID],
          allowDuplicatesKey: false,
          success() {
            that.setData({ statusMsg: '正在搜索 sEMG 设备...' });
            wx.onBluetoothDeviceFound(function(res) {
              res.devices.forEach(device => {
                const name = device.name || device.localName || '';
                if (name.toLowerCase().indexOf('semg') >= 0) {
                  wx.stopBluetoothDevicesDiscovery();
                  that._bleDeviceId = device.deviceId;
                  that.setData({ bleDeviceName: name, statusMsg: '发现设备: ' + name });
                  that._connectBle(device.deviceId);
                }
              });
            });

            // 10 秒超时
            that._retryTimer = setTimeout(() => {
              wx.stopBluetoothDevicesDiscovery();
              wx.offBluetoothDeviceFound();
              if (!that.data.connected) {
                that.setData({ status: 'idle', statusMsg: '未发现设备，请确保设备已通电并在配网模式' });
              }
            }, 10000);
          },
          fail(err) {
            that.setData({ status: 'failed', statusMsg: '蓝牙扫描失败: ' + err.errMsg });
          }
        });
      },
      fail(err) {
        that.setData({ status: 'failed', statusMsg: '蓝牙初始化失败: ' + err.errMsg });
      }
    });
  },

  // ==================== BLE 连接 ====================
  _connectBle(deviceId) {
    const that = this;
    this.setData({ status: 'connecting', statusMsg: '正在连接设备...', provisionStep: 'connecting_ble' });

    wx.createBLEConnection({
      deviceId,
      success() {
        that.setData({ connected: true, statusMsg: '已连接，正在读取设备信息...' });
        that._readDeviceId(deviceId);
      },
      fail(err) {
        that.setData({ status: 'failed', statusMsg: '连接失败: ' + err.errMsg });
      }
    });
  },

  // ==================== V3.0: 读取设备真实 deviceId ====================
  _readDeviceId(deviceId) {
    const that = this;
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId: BLE_SERVICE_ID,
      success(res) {
        const charList = (res.characteristics || []).map(c => c.uuid.toUpperCase());
        console.log('[NET] Characteristics:', charList);

        // 读取 deviceId 特征 (19B10005)
        wx.readBLECharacteristicValue({
          deviceId,
          serviceId: BLE_SERVICE_ID,
          characteristicId: CHAR_DEVICE_ID,
          success() {
            console.log('[NET] deviceId read requested');
          },
          fail() {
            console.log('[NET] deviceId read failed, using BLE ID fallback');
            // 降级: 用 BLE deviceId 后 6 位
            that._deviceId = 'sEMG_' + deviceId.slice(-6).toUpperCase();
            that.setData({ deviceId: that._deviceId });
            that._subscribeResult(deviceId);
          }
        });

        // 等待 read 回调
        wx.onBLECharacteristicValueChange(function(changeRes) {
          const uuid = (changeRes.characteristicId || '').toUpperCase();

          // 处理 deviceId 读取结果
          if (uuid === CHAR_DEVICE_ID) {
            const value = that._bufToString(changeRes.value);
            if (value && value.length > 0) {
              that._deviceId = value;
              console.log('[NET] Device ID:', that._deviceId);
              that.setData({ deviceId: that._deviceId });
              that._saveDeviceIdToStorage(that._deviceId);
            }
            that._subscribeResult(deviceId);
          }

          // 处理配网结果通知
          if (uuid === CHAR_RESULT) {
            const result = that._bufToString(changeRes.value);
            console.log('[NET] Provision result:', result);
            that._handleProvisionResult(result, deviceId);
          }
        });
      },
      fail(err) {
        console.error('[NET] getCharacteristics failed:', err);
        that.setData({ statusMsg: '获取特征失败: ' + err.errMsg });
      }
    });
  },

  // ==================== V3.0: 订阅配网结果通知 ====================
  _subscribeResult(deviceId) {
    const that = this;
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId: BLE_SERVICE_ID,
      characteristicId: CHAR_RESULT,
      state: true,
      success() {
        console.log('[NET] Result notify subscribed');
        that.setData({ statusMsg: '设备信息已读取，请输入 WiFi 密码' });
      },
      fail(err) {
        console.log('[NET] Result subscribe failed:', err);
        that.setData({ statusMsg: '设备信息已读取，请输入 WiFi 密码' });
      }
    });
  },

  // ==================== V3.0: 处理配网结果 ====================
  _handleProvisionResult(rawValue, deviceId) {
    let result = rawValue;
    let ip = '';

    // 尝试解析 JSON: {"result":"OK","ip":"192.168.1.5"}
    try {
      const json = JSON.parse(rawValue);
      result = json.result || rawValue;
      ip = json.ip || '';
    } catch (e) {
      // 纯文本: "CONNECTING" / "OK" / "FAIL"
    }

    console.log('[NET] Provision:', result, ip);

    if (result === 'CONNECTING') {
      this.setData({ statusMsg: '设备正在连接 WiFi...', provisionStep: 'waiting_wifi' });
      this._startProvisionTimeout(deviceId);
    }
    else if (result === 'OK') {
      this._clearProvisionTimeout();
      if (ip) {
        this.setData({ ip, configured: true, status: 'connected', statusMsg: '配网成功!', provisionStep: 'done' });
      } else {
        this.setData({ statusMsg: '配网成功，正在获取设备信息...', provisionStep: 'done' });
        // 从云端获取 IP
        setTimeout(() => this._getStatusFromCloud(), 2000);
      }
      // 断开 BLE
      this._disconnectBle(deviceId);
    }
    else if (result === 'FAIL') {
      this._clearProvisionTimeout();
      this.setData({ status: 'failed', statusMsg: 'WiFi 连接失败，请检查密码后重试', provisionStep: 'failed' });
    }
  },

  _startProvisionTimeout(deviceId) {
    this._clearProvisionTimeout();
    this._provisionTimeout = setTimeout(() => {
      if (this.data.provisionStep === 'waiting_wifi') {
        this.setData({ status: 'failed', statusMsg: '配网超时 (30s)，请重试', provisionStep: 'failed' });
        this._disconnectBle(deviceId);
      }
    }, 35000);
  },

  _clearProvisionTimeout() {
    if (this._provisionTimeout) {
      clearTimeout(this._provisionTimeout);
      this._provisionTimeout = null;
    }
  },

  // ==================== 写 WiFi 凭证 ====================
  startConfig() {
    if (!this.data.connected) {
      wx.showToast({ title: '请先连接设备', icon: 'none' });
      return;
    }
    this.setData({ showPassInput: true });
  },

  confirmConfig() {
    const { wifiConnected, wifiPass, _bleDeviceId } = this.data;
    const deviceId = this._bleDeviceId;

    if (!wifiConnected) {
      wx.showToast({ title: '请先输入 WiFi SSID', icon: 'none' });
      return;
    }
    if (!wifiPass || wifiPass.length < 8) {
      wx.showToast({ title: '密码至少 8 位', icon: 'none' });
      return;
    }

    this.setData({ status: 'configuring', statusMsg: '正在发送配置...', provisionStep: 'writing_ssid' });

    wx.setStorageSync('lastWiFiSSID', wifiConnected);

    // Step 1: write SSID
    const that = this;
    this._writeBleChar(deviceId, CHAR_SSID, wifiConnected)
      .then(() => {
        that.setData({ provisionStep: 'writing_pass' });
        // Step 2: write Password (password write triggers firmware to start connection)
        return that._writeBleChar(deviceId, CHAR_PASS, wifiPass);
      })
      .then(() => {
        that.setData({ statusMsg: '配置已发送，等待设备连接...', provisionStep: 'waiting_wifi' });
        that._startProvisionTimeout(deviceId);
      })
      .catch((err) => {
        that.setData({ status: 'failed', statusMsg: '发送失败: ' + (err.errMsg || err), provisionStep: 'failed' });
        that._disconnectBle(deviceId);
      });
  },

  _writeBleChar(deviceId, charId, value) {
    return new Promise((resolve, reject) => {
      // 将字符串转为 ArrayBuffer
      const buffer = this._strToBuf(value);

      wx.writeBLECharacteristicValue({
        deviceId,
        serviceId: BLE_SERVICE_ID,
        characteristicId: charId,
        value: buffer,
        success() {
          console.log('[NET] Write OK:', charId.slice(-2));
          setTimeout(resolve, 300);  // 等待硬件处理
        },
        fail(err) {
          console.error('[NET] Write FAIL:', charId.slice(-2), err);
          reject(err);
        }
      });
    });
  },

  // ==================== 断开 BLE ====================
  _disconnectBle(deviceId) {
    if (!deviceId) return;
    wx.closeBLEConnection({
      deviceId,
      success() {
        console.log('[NET] BLE disconnected');
      }
    });
  },

  // ==================== 云端状态读取 ====================
  _getStatusFromCloud() {
    if (!this._deviceId) {
      this.setData({ statusMsg: '无法获取设备信息 (deviceId 未知)' });
      return;
    }

    const that = this;
    wx.request({
      url: CLOUD_URL + '/getDeviceStatus',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { device_id: that._deviceId },
      success(res) {
        const body = res.data;
        if (body && body.code === 0 && body.data) {
          const { ip, ssid, updated_at } = body.data;
          that.setData({
            configured: true,
            status: 'connected',
            statusMsg: '已连接',
            ip: ip || '',
            ssid: ssid || '',
            provisionStep: 'done'
          });
          if (ssid) wx.setStorageSync('lastWiFiSSID', ssid);
        } else {
          that.setData({ statusMsg: '设备信息获取失败，请重试' });
        }
      },
      fail() {
        that.setData({ statusMsg: '网络请求失败，请检查网络后重试' });
      }
    });
  },

  refreshStatus() {
    if (this._deviceId) {
      this._getStatusFromCloud();
    } else {
      wx.showToast({ title: '请先配网获取设备 ID', icon: 'none' });
    }
  },

  // ==================== 重置 WiFi ====================
  resetConfig() {
    const that = this;
    wx.showModal({
      title: '确认重置',
      content: '将清除设备 WiFi 配网信息，设备将回到配网模式',
      success(res) {
        if (res.confirm) {
          that._doReset();
        }
      }
    });
  },

  _doReset() {
    const deviceId = this._bleDeviceId;
    if (deviceId) {
      // 方式 1: 已连接 BLE → 直接写 RESET_WIFI (固件 V2 兼容)
      this._writeBleChar(deviceId, CHAR_SSID, 'RESET_WIFI')
        .then(() => {
          wx.showToast({ title: '重置指令已发送', icon: 'success' });
          this.setData({ configured: false, ip: '', ssid: '', status: 'idle', statusMsg: '已重置，请重新配网' });
          wx.removeStorageSync('deviceId');
          wx.removeStorageSync('lastWiFiSSID');
        })
        .catch(() => {
          wx.showToast({ title: '重置失败，请重试', icon: 'none' });
        });
    } else if (this._deviceId) {
      // 方式 2: 通过云端命令重置
      wx.request({
        url: CLOUD_URL + '/sendDeviceCommand',
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          device_id: this._deviceId,
          command: 'reset_wifi',
          params: '{}'
        },
        success() {
          wx.showToast({ title: '重置命令已发送', icon: 'success' });
          this.setData({ configured: false, ip: '', ssid: '', status: 'idle', statusMsg: '等待设备响应...' });
        },
        fail() {
          wx.showToast({ title: '命令发送失败', icon: 'none' });
        }
      });
    } else {
      wx.showToast({ title: '未发现设备', icon: 'none' });
    }
  },

  // ==================== 工具函数 ====================
  _cleanup() {
    this._clearProvisionTimeout();
    if (this._retryTimer) clearTimeout(this._retryTimer);
    wx.offBluetoothDeviceFound();
    wx.stopBluetoothDevicesDiscovery();
    wx.closeBluetoothAdapter({});
  },

  _strToBuf(str) {
    const buffer = new ArrayBuffer(str.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < str.length; i++) {
      view[i] = str.charCodeAt(i);
    }
    return buffer;
  },

  _bufToString(buffer) {
    if (!buffer) return '';
    const view = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < view.length; i++) {
      str += String.fromCharCode(view[i]);
    }
    return str;
  },

  _saveDeviceIdToStorage(deviceId) {
    if (deviceId && deviceId.length > 0) {
      wx.setStorageSync('deviceId', deviceId);
      console.log('[NET] Device ID saved:', deviceId);
    }
  },

  // ==================== WiFi 列表 (微信 API) ====================
  onWifiSsidsChange(e) {
    const ssid = e.detail.value;
    this.setData({ wifiConnected: ssid });
  },

  // ==================== 密码输入 ====================
  onPassInput(e) {
    this.setData({ wifiPass: e.detail.value });
  },

  cancelConfig() {
    this.setData({ showPassInput: false, wifiPass: '' });
  },

  // ==================== 重新扫描 ====================
  rescan() {
    this._cleanup();
    this.setData({
      connected: false, configured: false, deviceId: '', ip: '', ssid: '',
      status: 'idle', statusMsg: '未连接', provisionStep: ''
    });
    this.startScan();
  }
});
