// pages/network/index.js 鈥?V3.0 Simplified Provisioning
// 瀵规爣灏忕背/娑傞甫 BLE 閰嶇綉鏍囧噯:
//   - BLE 杩炴帴鍚庡厛璇?deviceId (19B10005), 鍐嶅啓鍑瘉
//   - 璁㈤槄 result 閫氱煡 (19B10006), 涓嶅啀閫氳繃 IP 鐗瑰緛鑾峰彇鐘舵€?//   - 閰嶇綉鎴愬姛鍚庢柇寮€ BLE, 浠庝簯绔?getDeviceStatus 鑾峰彇 IP
//   - 璁惧 ID 浠ュ浐浠剁湡瀹?deviceId 涓哄噯
//   - 鍒犻櫎 IP notify 鐗瑰緛 (19B10003) 鐩稿叧閫昏緫

const { log, warn, error } = require('../../utils/logger');
const CLOUD_URL = 'https://cloud1-d4gqmimmo05b12c94.service.tcloudbase.com';

// BLE UUID 甯搁噺 (涓庡浐浠?V3.0 涓€鑷?
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
    wifiSsids: [],        // 闄勮繎 WiFi 鍒楄〃 (寰俊 API)
    wifiConnected: '',    // 褰撳墠鎵嬫満杩炴帴 WiFi 鐨?SSID
    wifiPass: '',
    showPassInput: false,
    // 閰嶇綉杩涘害
    provisionStep: '',    // '' | 'connecting_ble' | 'writing_ssid' | 'writing_pass' | 'waiting_wifi' | 'done' | 'failed'
  },

  onLoad() {
    log('[network] Cloud onLoad');
    // 娴嬭瘯1: 鐩存帴鍙戦€佸埌 /log 绔偣
    wx.request({
      url: 'http://192.168.137.1:9876/log',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { logs: [{ level: 'log', msg: '[NETWORK] TEST1 - direct /log POST', time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }] },
      success(res) { log('[NETWORK] TEST1 OK status=' + res.statusCode); },
      fail(err) { log('[NETWORK] TEST1 FAIL ' + err.errMsg); }
    });
    
    // 娴嬭瘯2: 鍙戦€佸埌 /health 绔偣锛堢‘璁ょ綉缁滈€氾級
    wx.request({
      url: 'http://192.168.137.1:9876/health',
      method: 'GET',
      success(res) { log('[NETWORK] TEST2 health OK', res.data); },
      fail(err) { log('[NETWORK] TEST2 health FAIL', err.errMsg); }
    });
    log('[network] ========== 页面加载 ==========');
    log('[network] 测试日志 - 如果能在GUI窗口看到这条消息，说明日志系统工作正常');
    
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

  // ==================== BLE 鎵弿 ====================
  startScan() {
    if (this._retryTimer) clearTimeout(this._retryTimer);

    this.setData({ status: 'scanning', statusMsg: '姝ｅ湪鎵弿璁惧...', provisionStep: '' });
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
            that.setData({ statusMsg: '姝ｅ湪鎼滅储 sEMG 璁惧...' });
            wx.onBluetoothDeviceFound((res) => {
              res.devices.forEach((device) => {
                const name = device.name || device.localName || '';
                if (name.toLowerCase().indexOf('semg') >= 0) {
                  wx.stopBluetoothDevicesDiscovery();
                  that._bleDeviceId = device.deviceId;
                  that.setData({ bleDeviceName: name, statusMsg: '鍙戠幇璁惧: ' + name });
                  that._connectBle(device.deviceId);
                }
              });
            });

            // 10 绉掕秴鏃?            that._retryTimer = setTimeout(() => {
              wx.stopBluetoothDevicesDiscovery();
              wx.offBluetoothDeviceFound();
              if (!that.data.connected) {
                that.setData({ status: 'idle', statusMsg: '鏈彂鐜拌澶囷紝璇风‘淇濊澶囧凡閫氱數骞跺湪閰嶇綉妯″紡' });
              }
            }, 10000);
          },
          fail(err) {
            that.setData({ status: 'failed', statusMsg: '钃濈墮鎵弿澶辫触: ' + err.errMsg });
          }
        });
      },
      fail(err) {
        that.setData({ status: 'failed', statusMsg: '钃濈墮鍒濆鍖栧け璐? ' + err.errMsg });
      }
    });
  },

  // ==================== BLE 杩炴帴 ====================
  _connectBle(deviceId) {
    const that = this;
    this.setData({ status: 'connecting', statusMsg: '姝ｅ湪杩炴帴璁惧...', provisionStep: 'connecting_ble' });

    wx.createBLEConnection({
      deviceId,
      success() {
        that.setData({ connected: true, statusMsg: '宸茶繛鎺ワ紝姝ｅ湪璇诲彇璁惧淇℃伅...' });
        that._readDeviceId(deviceId);
      },
      fail(err) {
        that.setData({ status: 'failed', statusMsg: '杩炴帴澶辫触: ' + err.errMsg });
      }
    });
  },

  // ==================== V3.0: 璇诲彇璁惧鐪熷疄 deviceId ====================
  _readDeviceId(deviceId) {
    const that = this;
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId: BLE_SERVICE_ID,
      success(res) {
        const charList = (res.characteristics || []).map(c => c.uuid.toUpperCase());
        log('[NET] Characteristics:', charList);

        // 璇诲彇 deviceId 鐗瑰緛 (19B10005)
        wx.readBLECharacteristicValue({
          deviceId,
          serviceId: BLE_SERVICE_ID,
          characteristicId: CHAR_DEVICE_ID,
          success() {
            log('[NET] deviceId read requested');
          },
          fail() {
            log('[NET] deviceId read failed, using BLE ID fallback');
            // 闄嶇骇: 鐢?BLE deviceId 鍚?6 浣?            that._deviceId = 'sEMG_' + deviceId.slice(-6).toUpperCase();
            that.setData({ deviceId: that._deviceId });
            that._subscribeResult(deviceId);
          }
        });

        // 绛夊緟 read 鍥炶皟
        wx.onBLECharacteristicValueChange(function(changeRes) {
          const uuid = (changeRes.characteristicId || '').toUpperCase();

          // 澶勭悊 deviceId 璇诲彇缁撴灉
          if (uuid === CHAR_DEVICE_ID) {
            const value = that._bufToString(changeRes.value);
            if (value && value.length > 0) {
              that._deviceId = value;
              log('[NET] Device ID:', that._deviceId);
              that.setData({ deviceId: that._deviceId });
              that._saveDeviceIdToStorage(that._deviceId);
            }
            that._subscribeResult(deviceId);
          }

          // 澶勭悊閰嶇綉缁撴灉閫氱煡
          if (uuid === CHAR_RESULT) {
            const result = that._bufToString(changeRes.value);
            log('[NET] Provision result:', result);
            that._handleProvisionResult(result, deviceId);
          }
        });
      },
      fail(err) {
        error('[NET] getCharacteristics failed:', err);
        that.setData({ statusMsg: '鑾峰彇鐗瑰緛澶辫触: ' + err.errMsg });
      }
    });
  },

  // ==================== V3.0: 璁㈤槄閰嶇綉缁撴灉閫氱煡 ====================
  _subscribeResult(deviceId) {
    const that = this;
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId: BLE_SERVICE_ID,
      characteristicId: CHAR_RESULT,
      state: true,
      success() {
        log('[NET] Result notify subscribed');
        that.setData({ statusMsg: '璁惧淇℃伅宸茶鍙栵紝璇疯緭鍏?WiFi 瀵嗙爜' });
      },
      fail(err) {
        log('[NET] Result subscribe failed:', err);
        that.setData({ statusMsg: '璁惧淇℃伅宸茶鍙栵紝璇疯緭鍏?WiFi 瀵嗙爜' });
      }
    });
  },

  // ==================== V3.0: 澶勭悊閰嶇綉缁撴灉 ====================
  _handleProvisionResult(rawValue, deviceId) {
    let result = rawValue;
    let ip = '';

    // 灏濊瘯瑙ｆ瀽 JSON: {"result":"OK","ip":"192.168.1.5"}
    try {
      const json = JSON.parse(rawValue);
      result = json.result || rawValue;
      ip = json.ip || '';
    } catch (e) {
      // 绾枃鏈? "CONNECTING" / "OK" / "FAIL"
    }

    log('[NET] Provision:', result, ip);

    if (result === 'CONNECTING') {
      this.setData({ statusMsg: '璁惧姝ｅ湪杩炴帴 WiFi...', provisionStep: 'waiting_wifi' });
      this._startProvisionTimeout(deviceId);
    }
    else if (result === 'OK') {
      this._clearProvisionTimeout();
      if (ip) {
        this.setData({ ip, configured: true, status: 'connected', statusMsg: '閰嶇綉鎴愬姛!', provisionStep: 'done' });
      } else {
        this.setData({ statusMsg: '閰嶇綉鎴愬姛锛屾鍦ㄨ幏鍙栬澶囦俊鎭?..', provisionStep: 'done' });
        // 浠庝簯绔幏鍙?IP
        setTimeout(() => this._getStatusFromCloud(), 2000);
      }
      // 鏂紑 BLE
      this._disconnectBle(deviceId);
    }
    else if (result === 'FAIL') {
      this._clearProvisionTimeout();
      this.setData({ status: 'failed', statusMsg: 'WiFi 杩炴帴澶辫触锛岃妫€鏌ュ瘑鐮佸悗閲嶈瘯', provisionStep: 'failed' });
    }
  },

  _startProvisionTimeout(deviceId) {
    this._clearProvisionTimeout();
    this._provisionTimeout = setTimeout(() => {
      if (this.data.provisionStep === 'waiting_wifi') {
        this.setData({ status: 'failed', statusMsg: '閰嶇綉瓒呮椂 (30s)锛岃閲嶈瘯', provisionStep: 'failed' });
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

  // ==================== 鍐?WiFi 鍑瘉 ====================
  startConfig() {
    if (!this.data.connected) {
      wx.showToast({ title: '璇峰厛杩炴帴璁惧', icon: 'none' });
      return;
    }
    this.setData({ showPassInput: true });
  },

  confirmConfig() {
    const { wifiConnected, wifiPass, _bleDeviceId } = this.data;
    const deviceId = this._bleDeviceId;

    if (!wifiConnected) {
      wx.showToast({ title: '璇峰厛杈撳叆 WiFi SSID', icon: 'none' });
      return;
    }
    if (!wifiPass || wifiPass.length < 8) {
      wx.showToast({ title: '瀵嗙爜鑷冲皯 8 浣?, icon: 'none' });
      return;
    }

    this.setData({ status: 'configuring', statusMsg: '姝ｅ湪鍙戦€侀厤缃?..', provisionStep: 'writing_ssid' });

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
        that.setData({ statusMsg: '閰嶇疆宸插彂閫侊紝绛夊緟璁惧杩炴帴...', provisionStep: 'waiting_wifi' });
        that._startProvisionTimeout(deviceId);
      })
      .catch((err) => {
        that.setData({ status: 'failed', statusMsg: '鍙戦€佸け璐? ' + (err.errMsg || err), provisionStep: 'failed' });
        that._disconnectBle(deviceId);
      });
  },

  _writeBleChar(deviceId, charId, value) {
    return new Promise((resolve, reject) => {
      // 灏嗗瓧绗︿覆杞负 ArrayBuffer
      const buffer = this._strToBuf(value);

      wx.writeBLECharacteristicValue({
        deviceId,
        serviceId: BLE_SERVICE_ID,
        characteristicId: charId,
        value: buffer,
        success() {
          log('[NET] Write OK:', charId.slice(-2));
          setTimeout(resolve, 300);  // 绛夊緟纭欢澶勭悊
        },
        fail(err) {
          error('[NET] Write FAIL:', charId.slice(-2), err);
          reject(err);
        }
      });
    });
  },

  // ==================== 鏂紑 BLE ====================
  _disconnectBle(deviceId) {
    if (!deviceId) return;
    wx.closeBLEConnection({
      deviceId,
      success() {
        log('[NET] BLE disconnected');
      }
    });
  },

  // ==================== 浜戠鐘舵€佽鍙?====================
  _getStatusFromCloud() {
    if (!this._deviceId) {
      this.setData({ statusMsg: '鏃犳硶鑾峰彇璁惧淇℃伅 (deviceId 鏈煡)' });
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
          const { ip, ssid, last_report } = body.data;
          that.setData({
            configured: true,
            status: 'connected',
            statusMsg: '宸茶繛鎺?,
            ip: ip || '',
            ssid: ssid || '',
            provisionStep: 'done'
          });
          if (ssid) wx.setStorageSync('lastWiFiSSID', ssid);
        } else {
          that.setData({ statusMsg: '璁惧淇℃伅鑾峰彇澶辫触锛岃閲嶈瘯' });
        }
      },
      fail() {
        that.setData({ statusMsg: '缃戠粶璇锋眰澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯' });
      }
    });
  },

  refreshStatus() {
    if (this._deviceId) {
      this._getStatusFromCloud();
    } else {
      wx.showToast({ title: '璇峰厛閰嶇綉鑾峰彇璁惧 ID', icon: 'none' });
    }
  },

  // ==================== 閲嶇疆 WiFi ====================
  resetConfig() {
    const that = this;
    wx.showModal({
      title: '纭閲嶇疆',
      content: '灏嗘竻闄よ澶?WiFi 閰嶇綉淇℃伅锛岃澶囧皢鍥炲埌閰嶇綉妯″紡',
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
      // 鏂瑰紡 1: 宸茶繛鎺?BLE 鈫?鐩存帴鍐?RESET_WIFI (鍥轰欢 V2 鍏煎)
      this._writeBleChar(deviceId, CHAR_SSID, 'RESET_WIFI')
        .then(() => {
          wx.showToast({ title: '閲嶇疆鎸囦护宸插彂閫?, icon: 'success' });
          this.setData({ configured: false, ip: '', ssid: '', status: 'idle', statusMsg: '宸查噸缃紝璇烽噸鏂伴厤缃? });
          wx.removeStorageSync('deviceId');
          wx.removeStorageSync('lastWiFiSSID');
        })
        .catch(() => {
          wx.showToast({ title: '閲嶇疆澶辫触锛岃閲嶈瘯', icon: 'none' });
        });
    } else if (this._deviceId) {
      // 鏂瑰紡 2: 閫氳繃浜戠鍛戒护閲嶇疆
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
          wx.showToast({ title: '閲嶇疆鍛戒护宸插彂閫?, icon: 'success' });
          this.setData({ configured: false, ip: '', ssid: '', status: 'idle', statusMsg: '绛夊緟璁惧鍝嶅簲...' });
        },
        fail() {
          wx.showToast({ title: '鍛戒护鍙戦€佸け璐?, icon: 'none' });
        }
      });
    } else {
      wx.showToast({ title: '鏈彂鐜拌澶?, icon: 'none' });
    }
  },

  // ==================== 宸ュ叿鍑芥暟 ====================
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
      log('[NET] Device ID saved:', deviceId);
    }
  },

  // ==================== WiFi 鍒楄〃 (寰俊 API) ====================
  onWifiSsidsChange(e) {
    const ssid = e.detail.value;
    this.setData({ wifiConnected: ssid });
  },

  // ==================== 瀵嗙爜杈撳叆 ====================
  onPassInput(e) {
    this.setData({ wifiPass: e.detail.value });
  },

  cancelConfig() {
    this.setData({ showPassInput: false, wifiPass: '' });
  },

  // ==================== 閲嶆柊鎵弿 ====================
  rescan() {
    this._cleanup();
    this.setData({
      connected: false, configured: false, deviceId: '', ip: '', ssid: '',
      status: 'idle', statusMsg: '鏈繛鎺?, provisionStep: ''
    });
    this.startScan();
  }
});

