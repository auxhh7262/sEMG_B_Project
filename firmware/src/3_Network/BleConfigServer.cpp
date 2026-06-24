// BleConfigServer.cpp — V3.0 Simplified BLE Provisioning
// 对配网模块的重构: 
//   - 删除 IP 推送特征 (19B10003)，改为配网结果通知 (19B10006)
//   - 删除 WifiInfoCallback / triggerWifiInfoCb
//   - 删除 requestReset() / _resetRequested 双路径
//   - 统一 resetNetwork() 入口
//   - 保留 v2 所有防护: 冷却期、单连接单推送、非阻塞连接处理
#include "BleConfigServer.h"
#include "0_Base/Logger.h"
#include <WiFiS3.h>
#include <EEPROM.h>

BleConfigServer* BleConfigServer::_instance = nullptr;

BleConfigServer::BleConfigServer()
    : _provisioning(false)
    , _deviceConnected(false)
    , _bleDeviceJustConnected(false)
    , _lastNotifyMs(0)
    , _hasNewCredentials(false)
{
    memset(_currentSSID, 0, sizeof(_currentSSID));
    memset(_currentPASS, 0, sizeof(_currentPASS));
    memset(_deviceId,   0, sizeof(_deviceId));
    _instance = this;
}

// ==================== deviceId ====================
void BleConfigServer::setDeviceId(const char* id) {
    strncpy(_deviceId, id, BLE_DEVICE_ID_MAX_LEN - 1);
    _deviceId[BLE_DEVICE_ID_MAX_LEN - 1] = '\0';
    _deviceIdChar.setValue(_deviceId);
    LOG("[BLE] Device ID set: %s\n", _deviceId);
}

// ==================== init ====================
void BleConfigServer::init() {
    LOG("[BLE] Initializing V3.0 BLE server...\n");
    if (!BLE.begin()) {
        LOG("[BLE] Init failed!\n");
        return;
    }

    BLE.setDeviceName("sEMG_Monitor");
    BLE.setLocalName("sEMG_0000");
    BLE.setAdvertisedServiceUuid("19b10000-e8f2-537e-4f6c-d104768a1214");
    BLE.setAdvertisedService(_bleService);

    // -- SSID 特征 (19B10001) --
    _wifiSsidChar.addDescriptor(_ssidDesc);
    _wifiSsidChar.setValue("");
    _bleService.addCharacteristic(_wifiSsidChar);

    // -- Password 特征 (19B10004) --
    _wifiPassChar.addDescriptor(_passDesc);
    _wifiPassChar.setValue("");
    _bleService.addCharacteristic(_wifiPassChar);

    // -- Device ID 特征 (19B10005, 只读) --
    _deviceIdChar.addDescriptor(_devIdDesc);
    _deviceIdChar.setValue("");  // 运行时 setDeviceId() 写入
    _bleService.addCharacteristic(_deviceIdChar);

    // -- Provision Result 特征 (19B10006, 通知) --
    _resultChar.addDescriptor(_resultDesc);
    _resultChar.setValue("");    // 初始空值
    _bleService.addCharacteristic(_resultChar);

    BLE.addService(_bleService);

    // -- 事件回调 --
    BLE.setEventHandler(BLEConnected, [](BLEDevice device) {
        LOG("[BLE] Device connected: %s\n", device.address().c_str());
        if (_instance) {
            _instance->_bleDeviceJustConnected = true;
        }
    });
    BLE.setEventHandler(BLEDisconnected, [](BLEDevice device) {
        LOG("[BLE] Device disconnected: %s\n", device.address().c_str());
        if (_instance) {
            _instance->_deviceConnected = false;
            _instance->_bleDeviceJustConnected = false;
            // 如果在配网模式，自动重启广播
            if (_instance->_provisioning) {
                BLE.advertise();
                LOG("[BLE] Auto restart advertising\n");
            }
        }
    });

    _wifiSsidChar.setEventHandler(BLEWritten, onSsidWritten);
    _wifiPassChar.setEventHandler(BLEWritten, onPassWritten);

    LOG("[BLE] V3.0 Server init done\n");
}

// ==================== 配网模式控制 ====================
void BleConfigServer::startProvisioning() {
    _provisioning = true;
    _hasNewCredentials = false;
    _deviceConnected = false;
    _bleDeviceJustConnected = false;
    BLE.stopAdvertise();
    delay(10);
    BLE.advertise();
    LOG("[BLE] Provisioning started (advertising)\n");
}

void BleConfigServer::stopProvisioning() {
    BLE.stopAdvertise();
    _provisioning = false;
    LOG("[BLE] Provisioning stopped\n");
}

// ==================== SSID/Password 写入处理 ====================
void BleConfigServer::onSsidWritten(BLEDevice device, BLECharacteristic characteristic) {
    BleConfigServer* inst = getInstance();
    if (!inst) return;

    String value = inst->_wifiSsidChar.value();
    LOG("[BLE] SSID received: %s\n", value.c_str());

    strncpy(inst->_currentSSID, value.c_str(), BLE_WIFI_SSID_MAX_LEN - 1);
    inst->_currentSSID[BLE_WIFI_SSID_MAX_LEN - 1] = '\0';
}

void BleConfigServer::onPassWritten(BLEDevice device, BLECharacteristic characteristic) {
    BleConfigServer* inst = getInstance();
    if (!inst) return;

    String value = inst->_wifiPassChar.value();
    LOG("[BLE] PASS received (len=%d)\n", value.length());

    strncpy(inst->_currentPASS, value.c_str(), BLE_WIFI_PASS_MAX_LEN - 1);
    inst->_currentPASS[BLE_WIFI_PASS_MAX_LEN - 1] = '\0';

    // SSID + PASS 都收到 → 标记凭证就绪
    if (strlen(inst->_currentSSID) > 0 && strlen(inst->_currentPASS) > 0) {
        LOG("[BLE] Full credentials received\n");
        inst->_hasNewCredentials = true;
        inst->_provisioning = false;
        BLE.stopAdvertise();
    }
}

// ==================== 凭证消费 ====================
bool BleConfigServer::hasNewCredentials() {
    return _hasNewCredentials;
}

WifiCredentials_t BleConfigServer::consumeCredentials() {
    WifiCredentials_t creds;
    creds.isValid = false;

    if (_hasNewCredentials) {
        strncpy(creds.ssid, _currentSSID, sizeof(creds.ssid) - 1);
        strncpy(creds.pass, _currentPASS, sizeof(creds.pass) - 1);
        creds.ssid[sizeof(creds.ssid) - 1] = '\0';
        creds.pass[sizeof(creds.pass) - 1] = '\0';
        creds.isValid = true;

        LOG("[BLE] Credentials consumed: SSID='%s'\n", creds.ssid);
        _hasNewCredentials = false;
        memset(_currentSSID, 0, sizeof(_currentSSID));
        memset(_currentPASS, 0, sizeof(_currentPASS));
    }
    return creds;
}

// ==================== 配网结果通知 ====================
void BleConfigServer::notifyProvisionResult(const char* result) {
    if (!_deviceConnected) {
        LOG("[BLE] notifyProvisionResult skipped: not connected\n");
        return;
    }

    _resultChar.setValue(result);
    _lastNotifyMs = millis();
    LOG("[BLE] Provision result notified: %s\n", result);
}

// ==================== 统一重置入口 ====================
void BleConfigServer::resetNetwork() {
    LOG("[BLE] === Reset Network ===\n");

    // 1. 清除 EEPROM 中的 WiFi 凭证
    char empty[65] = {0};
    EEPROM.put(0,  empty);
    EEPROM.put(64, empty);
    LOG("[BLE] EEPROM WiFi credentials cleared\n");

    // 2. 断开当前 WiFi
    if (WiFi.status() == WL_CONNECTED) {
        WiFi.disconnect();
        LOG("[BLE] WiFi disconnected\n");
    }

    // 3. 重启 BLE 广播进入配网模式
    startProvisioning();
}

// ==================== tick ====================
void BleConfigServer::tick() {
    BLE.poll();

    // 非阻塞连接处理（保留 v2 防护: 500ms 稳定后触发通知）
    if (_bleDeviceJustConnected) {
        static uint32_t _connStableTimer = 0;
        if (_connStableTimer == 0) {
            _connStableTimer = millis();
        } else if (millis() - _connStableTimer >= 500) {
            _bleDeviceJustConnected = false;
            _connStableTimer = 0;
            _deviceConnected = true;
            LOG("[BLE] Connection stable, ready\n");
        }
    }
}
