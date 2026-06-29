// pages/network/index.js — 设备配网页面

const { log, warn, error } = require('../../utils/logger');

// BLE UUIDs (from firmware BleConfigServer.h)
const SERVICE_UUID   = '19B10000-E8F2-537E-4F6C-D104768A1214';
const CHAR_SSID      = '19B10001-E8F2-537E-4F6C-D104768A1214';
const CHAR_PASS      = '19B10004-E8F2-537E-4F6C-D104768A1214';
const CHAR_DEVICE_ID = '19B10005-E8F2-537E-4F6C-D104768A1214';
const CHAR_RESULT    = '19B10006-E8F2-537E-4F6C-D104768A1214';

const CLOUD_ENV = 'cloud1-d4gqmimmo05b12c94';
const PROVISION_TIMEOUT = 35000;  // 35s: 比固件 30s 多 5s 缓冲
const STATUS_REFRESH_INTERVAL = 10000;  // 10s: 已连接设备状态自动刷新间隔
const MAX_DEVICE_STATUS_RETRIES = 6;  // 最多重试 6 次 (含首次, ~18s)

Page({
  data: {
    status: 'idle',          // idle/scanning/connected/configuring/configured/failed
    statusMsg: '',
    deviceId: '',
    ip: '',
    ssid: '',
    bleDeviceName: '',
    connected: false,
    configured: false,
    showPassInput: false,
    wifiConnected: '',       // SSID input (named wifiConnected for backward compat)
    wifiPass: '',
    provisionStep: '',       // '' / 'connecting_ble' / 'writing_ssid' / 'writing_pass' / 'waiting_wifi' / 'done'
    stepsActive: 0           // 0/1/2/3
  },

  // BLE device reference
  _device: null,
  _serviceProfile: null,
  _deviceStatusRetries: 0,

  onLoad() {
    log('[Network] page loaded');
    this._initBle();
  },

  onUnload() {
    this._cleanupBle();
  },

  // ========== BLE 初始化 ==========
  _initBle() {
    wx.openBluetoothAdapter({
      success: () => {
        log('[BLE] Adapter opened');
        this._onBleStateChange();
      },
      fail: (err) => {
        error('[BLE] open adapter fail:', err);
        if (err.errCode === 10001) {
          wx.showModal({
            title: '蓝牙未开启',
            content: '请先打开手机蓝牙',
            showCancel: false
          });
        }
      }
    });
    wx.onBluetoothAdapterStateChange(this._onBleStateChange.bind(this));
    wx.onBLEConnectionStateChange(this._onConnectionChange.bind(this));
  },

  _onBleStateChange() {
    wx.getBluetoothAdapterState({
      success: (res) => {
        if (!res.available) {
          this.setData({ status: 'idle', statusMsg: '蓝牙不可用' });
        }
      }
    });
  },

  _cleanupBle() {
    try { wx.closeBluetoothAdapter(); } catch(e) {}
  },

  // ========== 扫描 ==========
  startScan() {
    this.setData({ status: 'scanning', statusMsg: '搜索设备中...', deviceId: '', connected: false });

    // 防御：确保适配器已打开再扫描（适配器可能因用户关闭蓝牙等原因处于关闭态）
    wx.openBluetoothAdapter({
      success: () => {
        log('[BLE] adapter ready, starting discovery');
        this._doStartScan();
      },
      fail: (err) => {
        error('[BLE] adapter open fail:', err);
        this.setData({ status: 'idle', statusMsg: '蓝牙未开启' });
      }
    });
  },

  _doStartScan() {
    // 不传 services 过滤，避免部分手机因 UUID 格式差异滤掉设备
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      success: () => log('[BLE] scan started (no UUID filter)'),
      fail: (err) => {
        error('[BLE] scan fail:', err);
        this.setData({ status: 'idle', statusMsg: '搜索失败，请重试' });
      }
    });

    wx.onBluetoothDeviceFound((res) => {
      for (const dev of (res.devices || [])) {
        const name = dev.name || dev.localName || '';
        if (!name.startsWith('sEMG')) continue;
        log('[BLE] found sEMG device:', name, dev.deviceId);
        this._connectDevice(dev);
        return;
      }
    });

    // 扫描超时 15s
    if (this._scanTimer) clearTimeout(this._scanTimer);
    this._scanTimer = setTimeout(() => {
      wx.stopBluetoothDevicesDiscovery();
      if (!this.data.connected) {
        this.setData({ status: 'idle', statusMsg: '未找到设备，请确保设备处于配网模式' });
      }
    }, 15000);
  },

  // ========== 连接 ==========
  _connectDevice(device) {
    if (this._scanTimer) clearTimeout(this._scanTimer);

    wx.stopBluetoothDevicesDiscovery();
    this._device = device;
    this.setData({
      bleDeviceName: device.name || device.localName || 'sEMG Device',
      statusMsg: '连接中...'
    });

    wx.createBLEConnection({
      deviceId: device.deviceId,
      success: () => {
        log('[BLE] connected to', device.name);
        // 等待 500ms 让 BLE 稳定后再获取服务
        setTimeout(() => this._getServices(device.deviceId), 500);
      },
      fail: (err) => {
        error('[BLE] connect fail:', err);
        this.setData({ status: 'idle', statusMsg: '连接失败，请重试' });
      }
    });
  },

  _getServices(deviceId) {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        const svc = res.services.find(s => s.uuid.toUpperCase() === SERVICE_UUID);
        if (!svc) {
          this.setData({ status: 'idle', statusMsg: '服务未找到' });
          return;
        }
        this._serviceProfile = { deviceId, serviceId: svc.uuid };
        this._getCharacteristics(deviceId, svc.uuid);
      },
      fail: (err) => {
        error('[BLE] get services fail:', err);
        this.setData({ status: 'idle', statusMsg: '获取服务失败' });
      }
    });
  },

  _getCharacteristics(deviceId, serviceId) {
    wx.getBLEDeviceCharacteristics({
      deviceId, serviceId,
      success: (res) => {
        log('[BLE] characteristics found:', res.characteristics.length);

        // 启用 notify on result char (CHAR_RESULT)
        const resultChar = res.characteristics.find(
          c => c.uuid.toUpperCase() === CHAR_RESULT
        );
        if (resultChar && resultChar.properties.notify) {
          wx.notifyBLECharacteristicValueChange({
            deviceId, serviceId, characteristicId: resultChar.uuid,
            state: true,
            success: () => log('[BLE] notify enabled on result char'),
            fail: (err) => warn('[BLE] notify enable fail:', err)
          });
          wx.onBLECharacteristicValueChange(this._onNotify.bind(this));
        }

        // 读取 deviceId (CHAR_DEVICE_ID)
        const devIdChar = res.characteristics.find(
          c => c.uuid.toUpperCase() === CHAR_DEVICE_ID
        );
        if (devIdChar && devIdChar.properties.read) {
          wx.readBLECharacteristicValue({
            deviceId, serviceId, characteristicId: devIdChar.uuid,
            success: () => log('[BLE] reading deviceId...'),
            fail: (err) => warn('[BLE] read deviceId fail:', err)
          });
          // Wait for onBLECharacteristicValueChange with deviceId
        }

        this.setData({
          connected: true,
          status: 'connected',
          statusMsg: '已连接'
        });
      },
      fail: (err) => {
        error('[BLE] get characteristics fail:', err);
        this.setData({ status: 'idle', statusMsg: '获取特征值失败' });
      }
    });
  },

  _onNotify(res) {
    const text = this._ab2str(res.value);
    log('[BLE] notify:', text);

    // 如果是 deviceId char 的值（先收到）
    if (res.characteristicId.toUpperCase() === CHAR_DEVICE_ID) {
      this.setData({ deviceId: text });
      return;
    }

    // 如果是 result char 的通知
    if (res.characteristicId.toUpperCase() === CHAR_RESULT) {
      if (text === 'OK') {
        log('[BLE] Provision OK!');
        this.setData({
          provisionStep: 'done',
          stepsActive: 3,
          statusMsg: '配网成功!'
        });
        // 延迟断开 BLE，然后从云端获取设备状态
        this._disconnectBle();
        // 固件 reportStatus 需要 HTTP 往返时间，延迟 3s 再查
        this._deviceStatusRetries = 0;
        if (this._deviceStatusTimer) clearTimeout(this._deviceStatusTimer);
        this._deviceStatusTimer = setTimeout(() => this._fetchDeviceStatus(), 3000);
      } else if (text === 'CONNECTING') {
        this.setData({
          provisionStep: 'waiting_wifi',
          stepsActive: 2,
          statusMsg: '设备连接WiFi中...'
        });
      } else if (text === 'FAIL') {
        this.setData({
          status: 'failed',
          statusMsg: '配网失败',
          provisionStep: '',
          showPassInput: true
        });
      }
    }
  },

  _onConnectionChange(res) {
    if (!res.connected) {
      log('[BLE] disconnected:', res.deviceId);
      if (this.data.provisionStep !== 'done' && this._provisionTimer) {
        // Unexpected disconnect during provisioning
        this.setData({ status: 'idle', statusMsg: '连接断开' });
      }
    }
  },

  _disconnectBle() {
    if (this._device) {
      try { wx.closeBLEConnection({ deviceId: this._device.deviceId }); } catch(e) {}
      this._device = null;
    }
  },

  // ========== WiFi 配置 ==========
  startConfig() {
    this.setData({ showPassInput: true });
  },

  cancelConfig() {
    this.setData({ showPassInput: false, wifiPass: '' });
  },

  onWifiSsidsChange(e) {
    this.setData({ wifiConnected: e.detail.value });
  },

  onPassInput(e) {
    this.setData({ wifiPass: e.detail.value });
  },

  async confirmConfig() {
    const { wifiConnected, wifiPass, deviceId } = this.data;
    if (!wifiConnected || !wifiPass) {
      wx.showToast({ title: '请输入SSID和密码', icon: 'none' });
      return;
    }

    this.setData({
      status: 'configuring',
      statusMsg: '正在配网...',
      provisionStep: 'connecting_ble',
      stepsActive: 0
    });

    const { deviceId: bleId, serviceId } = this._serviceProfile;

    try {
      // Step 1: 写 SSID
      await this._writeChar(bleId, serviceId, CHAR_SSID, wifiConnected);
      log('[BLE] SSID written');
      this.setData({ provisionStep: 'writing_ssid', stepsActive: 1 });

      // 等待 100ms 固件处理 SSID
      await this._delay(100);

      // Step 2: 写 PASS
      await this._writeChar(bleId, serviceId, CHAR_PASS, wifiPass);
      log('[BLE] PASS written');
      this.setData({ provisionStep: 'writing_pass', stepsActive: 1, wifiPass: '' });

      // Step 3: 等待固件返回 "CONNECTING" → "OK"（通过 _onNotify）
      this._startProvisionTimeout();

    } catch (err) {
      error('[BLE] write fail:', err);
      if (err.errMsg && err.errMsg.indexOf('no connection') > -1) {
        // BLE 连接丢失，重连并重试一次
        wx.showToast({ title: '连接中断，重连中...', icon: 'none' });
        this.setData({ provisionStep: 'connecting_ble', stepsActive: 0 });
        this._reconnectAndRetry();
      } else {
        this.setData({ status: 'failed', statusMsg: '发送失败: ' + (err.errMsg || '') });
      }
    }
  },

  // BLE 重连重试
  _reconnectAndRetry() {
    if (!this._device) return;
    wx.createBLEConnection({
      deviceId: this._device.deviceId,
      success: () => {
        log('[BLE] reconnected for retry');
        setTimeout(() => this.confirmConfig(), 1000);
      },
      fail: () => {
        this.setData({ status: 'idle', statusMsg: '重连失败，请重新扫描' });
      }
    });
  },

  _writeChar(deviceId, serviceId, charUuid, value) {
    return new Promise((resolve, reject) => {
      const buffer = this._str2ab(value);
      wx.writeBLECharacteristicValue({
        deviceId, serviceId, characteristicId: charUuid, value: buffer,
        success: resolve,
        fail: reject
      });
    });
  },

  _startProvisionTimeout() {
    if (this._provisionTimer) clearTimeout(this._provisionTimer);
    this._provisionTimer = setTimeout(() => {
      if (this.data.provisionStep !== 'done') {
        log('[BLE] provision timeout');
        this.setData({ status: 'failed', statusMsg: '设备已离线，请检查网络或重新配网' });
        this._disconnectBle();
      }
    }, PROVISION_TIMEOUT);
  },

  // ========== 云端获取设备状态 ==========
  async _fetchDeviceStatus() {
    const { deviceId } = this.data;
    if (!deviceId) {
      this.setData({ status: 'configured', statusMsg: '无设备ID', ip: '—' });
      return;
    }

    this._deviceStatusRetries++;
    log('[Cloud] fetchDeviceStatus #', this._deviceStatusRetries, ':', deviceId);

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDeviceStatus',
        data: { device_id: deviceId }
      });

      log('[Cloud] getDeviceStatus result:', res);

      if (res.result && res.result.code === 0 && res.result.data) {
        const d = res.result.data;
        this._deviceStatusRetries = 0;
        if (this._deviceStatusTimer) { clearTimeout(this._deviceStatusTimer); this._deviceStatusTimer = null; }
        const online = d.online !== false;
        this.setData({
          status: 'configured',
          statusMsg: online ? '设备已连接网络' : '设备已离线，请检查网络或重新配网',
          configured: true,
          ip: online ? (d.ip || '—') : '—',
          ssid: d.ssid || this.data.wifiConnected,
          provisionStep: ''
        });
        if (online) this._startAutoRefresh();
      } else if (this._deviceStatusRetries >= MAX_DEVICE_STATUS_RETRIES) {
        // 达到最大重试次数，停止等待
        log('[Cloud] max retries reached, stopping');
        this._deviceStatusRetries = 0;
        if (this._deviceStatusTimer) { clearTimeout(this._deviceStatusTimer); this._deviceStatusTimer = null; }
        this.setData({
          status: 'configured',
          statusMsg: '配网完成，等待同步',
          configured: true,
          ip: '—',
          ssid: this.data.wifiConnected,
          provisionStep: ''
        });
      } else {
        // 设备可能尚未上报状态，稍后重试
        log('[Cloud] device not found, retry #', this._deviceStatusRetries, '/', MAX_DEVICE_STATUS_RETRIES);
        this.setData({ status: 'configuring', statusMsg: '等待设备上线...' });
        if (this._deviceStatusTimer) clearTimeout(this._deviceStatusTimer);
        this._deviceStatusTimer = setTimeout(() => this._fetchDeviceStatus(), 3000);
      }
    } catch (err) {
      error('[Cloud] fetch status fail:', err);
      // catch 不计数，直接停止（不走 retry 循环）
      this._deviceStatusRetries = 0;
      if (this._deviceStatusTimer) { clearTimeout(this._deviceStatusTimer); this._deviceStatusTimer = null; }
      this.setData({
        status: 'configured',
        statusMsg: '配网完成，云端查询失败',
        configured: true,
        ip: '—',
        ssid: this.data.wifiConnected,
        provisionStep: ''
      });
    }
  },

  refreshStatus() {
    this.setData({ statusMsg: '刷新中...' });
    this._fetchDeviceStatus();
  },

  // ========== 自动刷新设备状态（已连接时 10s 轮询） ==========
  _startAutoRefresh() {
    this._stopAutoRefresh();
    log('[UI] start auto-refresh, interval', STATUS_REFRESH_INTERVAL, 'ms');
    this._autoRefreshTimer = setInterval(() => {
      this._autoRefreshStatus();
    }, STATUS_REFRESH_INTERVAL);
  },

  _stopAutoRefresh() {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
      log('[UI] auto-refresh stopped');
    }
  },

  async _autoRefreshStatus() {
    const { deviceId } = this.data;
    if (!deviceId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'getDeviceStatus',
        data: { device_id: deviceId }
      });

      if (res.result && res.result.code === 0 && res.result.data) {
        const d = res.result.data;
        const online = d.online !== false;
        this.setData({
          status: 'configured',
          statusMsg: online ? '设备已连接网络' : '设备已离线，请检查网络或重新配网',
          ip: online ? (d.ip || '—') : '—',
          ssid: d.ssid || this.data.wifiConnected
        });
      }
      // 查不到数据 → 设备可能离线，静默等待下次轮询
    } catch (_) {
      // 网络/云函数异常，静默等待下次轮询
    }
  },

  // 重新配网：关闭 BLE 适配器 + 重置所有状态，回到初始扫描页
  reProvision() {
    log('[UI] reProvision - resetting all state');

    // 清除所有遗留定时器，防止旧回调污染新状态
    if (this._scanTimer) { clearTimeout(this._scanTimer); this._scanTimer = null; }
    if (this._provisionTimer) { clearTimeout(this._provisionTimer); this._provisionTimer = null; }
    if (this._deviceStatusTimer) { clearTimeout(this._deviceStatusTimer); this._deviceStatusTimer = null; }
    this._stopAutoRefresh();

    this._disconnectBle();
    this._device = null;
    this._deviceStatusRetries = 0;

    // 停止扫描（不关适配器——关适配器会导致 startScan 时无适配器可用）
    try { wx.stopBluetoothDevicesDiscovery(); } catch(e) {}

    this.setData({
      status: 'idle',
      statusMsg: '',
      connected: false,
      configured: false,
      deviceId: '',
      deviceName: '',
      bleDeviceName: '',
      provisionStep: '',
      stepsActive: 0,
      showPassInput: false,
      wifiConnected: '',
      wifiPass: '',
      ip: '',
      ssid: ''
    });
  },

  // ========== 工具方法 ==========
  _str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
      view[i] = str.charCodeAt(i);
    }
    return buf;
  },

  _ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});
