// BleConfigServer.h — BLE 配网模块声明
#ifndef BLECONFIGSERVER_H
#define BLECONFIGSERVER_H

#include <ArduinoBLE.h>
#include "0_Base/Globals.h"

#define BLE_WIFI_SSID_MAX_LEN 32
#define BLE_WIFI_PASS_MAX_LEN 64
#define BLE_DEVICE_ID_MAX_LEN 24
#define BLE_RESULT_MAX_LEN     64

class BleConfigServer {
public:
    BleConfigServer();
    void init();
    void tick();

    // === 配网模式控制 ===
    void startProvisioning();   // 开始/重启 BLE 广播
    void stopProvisioning();    // 停止 BLE 广播（WiFi已连接）
    bool isProvisioning() const { return _provisioning; }
    bool isConnected() const { return _deviceConnected; }

    // === 设备ID（由 main.cpp 在 Boot 时设置） ===
    void setDeviceId(const char* id);

    // === WiFi 凭证 ===
    bool hasNewCredentials();
    WifiCredentials_t consumeCredentials();

    // === 配网结果通知 → 小程序 ===
    // result: "CONNECTING" / "OK" / "FAIL"
    void notifyProvisionResult(const char* result);

    // === 统一重置入口（清除 EEPROM + 断开 WiFi + 重启广播） ===
    void resetNetwork();

    // === BLE 冷却期（防止连续操作崩溃） ===
    bool isInCooldown() const { return (millis() - _lastNotifyMs) < 500; }

    // === 静态回调 & 实例 ===
    static BleConfigServer* getInstance() { return _instance; }
    static void onSsidWritten(BLEDevice device, BLECharacteristic characteristic);
    static void onPassWritten(BLEDevice device, BLECharacteristic characteristic);

private:
    // === 状态 ===
    bool _provisioning;
    bool _deviceConnected;
    bool _bleDeviceJustConnected;  // 非阻塞连接处理
    uint32_t _lastNotifyMs;         // BLE 冷却计时器

    // === WiFi 凭证 ===
    char _currentSSID[BLE_WIFI_SSID_MAX_LEN];
    char _currentPASS[BLE_WIFI_PASS_MAX_LEN];
    bool _hasNewCredentials;

    // === 设备ID ===
    char _deviceId[BLE_DEVICE_ID_MAX_LEN];

    // === BLE 服务 & 特征值 ===
    // 服务: 19B10000（微信小程序兼容）
    // 特征: 19B10001=SSID(write), 19B10004=Password(write)
    //       19B10005=deviceId(read), 19B10006=result(notify)
    BLEService _bleService   = BLEService("19b10000-e8f2-537e-4f6c-d104768a1214");

    BLEStringCharacteristic _wifiSsidChar
        { "19b10001-e8f2-537e-4f6c-d104768a1214", BLEWrite | BLENotify, BLE_WIFI_SSID_MAX_LEN };
    BLEStringCharacteristic _wifiPassChar
        { "19b10004-e8f2-537e-4f6c-d104768a1214", BLEWrite | BLENotify, BLE_WIFI_PASS_MAX_LEN };
    BLEStringCharacteristic _deviceIdChar
        { "19b10005-e8f2-537e-4f6c-d104768a1214", BLERead, BLE_DEVICE_ID_MAX_LEN };
    BLEStringCharacteristic _resultChar
        { "19b10006-e8f2-537e-4f6c-d104768a1214", BLENotify, BLE_RESULT_MAX_LEN };

    BLEDescriptor _ssidDesc  { "2901", "WiFi SSID" };
    BLEDescriptor _passDesc  { "2901", "WiFi Password" };
    BLEDescriptor _devIdDesc { "2901", "Device ID" };
    BLEDescriptor _resultDesc{ "2901", "Provision Result" };

    static BleConfigServer* _instance;
};

#endif
