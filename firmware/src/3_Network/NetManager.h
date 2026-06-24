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

// 上传参数
#define INGEST_BATCH_FRAMES    30    // 每批上传帧数 (3秒 @ 10Hz)
#define INGEST_RETRY_QUEUE     120   // 断网重试队列最大帧数
#define WIFI_RETRY_INTERVAL    10000 // WiFi 重连间隔(ms)

class NetManager {
public:
    NetManager();

    bool initBlocking(uint32_t wifiTimeoutMs = 30000);
    void tick();
    bool pushDataPoint(uint32_t ts, float rms, float act, float mdf,
                       float fatigue, uint8_t quality);
    void uploadCalibration(float relaxRms, float relaxMdf,
                           float activeRms, float activeMdf);
    void reportStatus() { _reportStatus(); }

    bool isWifiConnected() const { return _wifiConnected; }
    const char* getDeviceId() const { return _deviceId; }

    void onResetWifi(void (*cb)()) { _onResetWifi = cb; }
    void onWifiLostTimeout(void (*cb)()) { _onWifiLostTimeout = cb; }

private:
    void _wifiTick();
    void _checkIngest();
    bool _httpPost(const char* url, const char* jsonBody);
    void _genDeviceId(char* buf, size_t len);

    bool _wifiConnected;
    uint32_t _wifiRetryTimer;

    struct DataPoint {
        uint32_t ts;
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
    bool _sessionActive;

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
    uint32_t _wifiDisconnectedSince;
};

#endif