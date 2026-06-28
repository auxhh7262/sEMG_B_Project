#ifndef NET_MANAGER_H
#define NET_MANAGER_H

#include <Arduino.h>
#include <WiFiS3.h>

// [CLOUD] NetManager V3.0 — WiFi + HTTP POST + 自动重连
// V3.1: 改用 HTTP 绕过 UNO R4 WiFi HTTPS 兼容性问题

#define CLOUD_BASE_DOMAIN "cloud1-d4gqmimmo05b12c94-1446329561.ap-shanghai.app.tcloudbase.com"

// HTTP (80端口) — 绕过 HTTPS TLS 兼容性问题
#define CLOUD_URL_DEVICE_REGISTER   "http://" CLOUD_BASE_DOMAIN "/deviceRegister"
#define CLOUD_URL_DATA_INGEST       "http://" CLOUD_BASE_DOMAIN "/dataIngest"
#define CLOUD_URL_GET_COMMAND       "http://" CLOUD_BASE_DOMAIN "/getDeviceCommand"
#define CLOUD_URL_REPORT_STATUS     "http://" CLOUD_BASE_DOMAIN "/reportDeviceStatus"
#define CLOUD_URL_ACK_COMMAND       "http://" CLOUD_BASE_DOMAIN "/ackDeviceCommand"
#define CLOUD_URL_UPLOAD_CALIB      "http://" CLOUD_BASE_DOMAIN "/uploadCalibration"

// 上传参数
#define INGEST_BATCH_FRAMES    10    // 每批上传帧数 (1秒 @ 10Hz)
#define INGEST_RETRY_QUEUE     150   // 断网重试队列最大帧数 (15秒缓存)
#define WIFI_RETRY_INTERVAL    10000 // WiFi 重连间隔(ms)

class NetManager {
public:
    NetManager();

    bool initBlocking(uint32_t wifiTimeoutMs = 30000);
    void tick();
    // 云端使用服务器时间，无需上传 ts 字段
    bool pushDataPoint(float rms, float act, float mdf,
                       float fatigue, uint8_t quality);
    void uploadCalibration(float relaxRms, float relaxMdf,
                           float activeRms, float activeMdf);
    void uploadCalibPhase(const char* phase, float rms, float mdf,
                          float endMdf = 0.0f);
    void reportStatus() { _reportStatus(); }

    bool isWifiConnected() const { return _wifiConnected; }
    const char* getDeviceId() const { return _deviceId; }

    // [V3.2] BLE 配网后同步更新重连凭据
    void updateSavedCredentials(const char* ssid, const char* pass);

    // [V3.3] BLE 配网期间暂停 WiFi 重连（防止射频冲突导致 BLE 断开）
    void pauseWifiRetry()   { _provisioningActive = true; }
    void resumeWifiRetry()  { _provisioningActive = false; }

    void onResetWifi(void (*cb)()) { _onResetWifi = cb; }
    void onWifiLostTimeout(void (*cb)()) { _onWifiLostTimeout = cb; }
    void onWifiReconnected(void (*cb)()) { _onWifiReconnected = cb; }

    // 校准命令回调
    void onRecordRelax(void (*cb)()) { _onRecordRelax = cb; }
    void onRecordActive(void (*cb)()) { _onRecordActive = cb; }
    void onSaveCalib(void (*cb)()) { _onSaveCalib = cb; }

private:
    void _wifiTick();
    void _checkIngest();
    bool _httpPost(const char* url, const char* jsonBody);
    bool _httpPost(const char* url, const char* jsonBody, String* outBody);
    void _genDeviceId(char* buf, size_t len);

    bool _wifiConnected;
    uint32_t _wifiRetryTimer;

    struct DataPoint {
        float rms, act, mdf, fatigue;
        uint8_t quality;
    };
    DataPoint _batchBuffer[INGEST_BATCH_FRAMES];
    uint8_t _batchCount;

    DataPoint _retryQueue[INGEST_RETRY_QUEUE];
    uint8_t _retryCount;
    uint8_t _retryHead;

    char _jsonBuf[2048];
    char _deviceId[20];
    char _sessionId[40];
    char _lastCommandId[64];  // track pending command for ack
    bool _sessionActive;

    // 保存 WiFi 凭证副本（用于重连）
    char _savedSsid[33];
    char _savedPass[65];

    float _relaxRms, _relaxMdf, _activeRms, _activeMdf;
    bool _calibReady;

    uint32_t _lastIngestMs;
    uint32_t _lastCommandCheck;
    uint32_t _lastStatusReport;

    void _checkCommand();
    void _executeCommand(const char* command, const char* paramsJson);
    void _reportStatus();
    void _ackCommand(const char* commandId);

    void (*_onResetWifi)();
    void (*_onWifiLostTimeout)();
    void (*_onWifiReconnected)();
    bool _bleOpened;
    bool _provisioningActive;   // [V3.3] BLE 配网中，暂停 WiFi 重连
    void (*_onRecordRelax)();
    void (*_onRecordActive)();
    void (*_onSaveCalib)();
    uint32_t _wifiDisconnectedSince;
};

#endif // NET_MANAGER_H