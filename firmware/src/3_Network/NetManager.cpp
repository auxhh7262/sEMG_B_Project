// NetManager.cpp — HTTP 云端上传模块
#include "NetManager.h"
#include "0_Base/Logger.h"
#include <EEPROM.h>

NetManager::NetManager()
    : _wifiConnected(false)
    , _wifiRetryTimer(0)
    , _batchCount(0)
    , _retryCount(0)
    , _retryHead(0)
    , _sessionActive(false)
    , _relaxRms(0), _relaxMdf(0), _activeRms(0), _activeMdf(0)
    , _calibReady(false)
    , _lastIngestMs(0)
    , _lastCommandCheck(0)
    , _lastStatusReport(0)
    , _minuteStartSec(0)
    , _rmsSum(0), _rmsMax(0), _rmsMin(999999)
    , _mdfSum(0), _mdfMax(0)
    , _fatigueSum(0), _fatigueMax(0)
    , _qualitySum(0)
    , _minuteCount(0)
    , _onResetWifi(nullptr)
    , _onWifiLostTimeout(nullptr)
    , _onRecordRelax(nullptr)
    , _onRecordActive(nullptr)
    , _onSaveCalib(nullptr)
    , _onResetCalib(nullptr)
    , _onProfile(nullptr)
    , _profileFetched(false)
    , _wifiDisconnectedSince(0)
    , _bleOpened(false)
    , _provisioningActive(false)
    , _timeSynced(false)
    , _ntpBaseSec(0)
    , _ntpBaseMs(0)
    , _ntpPending(false)
    , _ntpRequestTime(0)
    , _ntpRetryCount(0)
{
    memset(_deviceId, 0, sizeof(_deviceId));
    memset(_sessionId, 0, sizeof(_sessionId));
    memset(_lastCommandId, 0, sizeof(_lastCommandId));
    memset(_lastParams, 0, sizeof(_lastParams));
    memset(_ntpPacketBuffer, 0, sizeof(_ntpPacketBuffer));
}

void NetManager::_genDeviceId(char* buf, size_t len) {
    byte mac[6];
    WiFi.macAddress(mac);
    snprintf(buf, len, "sEMG_%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

bool NetManager::initBlocking(uint32_t wifiTimeoutMs) {
    _genDeviceId(_deviceId, sizeof(_deviceId));
    LOG("[NET] Device ID: %s\n", _deviceId);

    String fv = WiFi.firmwareVersion();
    LOG("[NET] WiFi firmware: %s\n", fv.c_str());

    char ssid[33] = {0}, pass[65] = {0};
    EEPROM.get(0, ssid);
    EEPROM.get(64, pass);

    if (strlen(ssid) > 0) {
        LOG("[NET] Using saved WiFi: %s\n", ssid);
    } else {
        strcpy(ssid, "LT02");
        strcpy(pass, "88888888");
        LOG("[NET] Using hardcoded WiFi: %s\n", ssid);
    }

    // 保存凭证副本（用于重连）
    strncpy(_savedSsid, ssid, sizeof(_savedSsid)-1);
    strncpy(_savedPass, pass, sizeof(_savedPass)-1);

    delay(1000);

    // 初始化 sessionId
    uint32_t now = millis();
    snprintf(_sessionId, sizeof(_sessionId), "%s_%lu", _deviceId, now);

    LOG("[NET] Connecting WiFi (timeout %lums)...\n", wifiTimeoutMs);
    WiFi.begin(ssid, pass);

    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > wifiTimeoutMs) {
            LOG("[NET] WiFi connect TIMEOUT\n");
            return false;
        }
        delay(500);
    }

    _wifiConnected = true;
    _wifiDisconnectedSince = 0;

    {
        uint32_t dhcpStart = millis();
        while (millis() - dhcpStart < 10000) {
            IPAddress ip = WiFi.localIP();
            if (ip[0] != 0 && ip[0] != 255) break;
            delay(500);
        }
        IPAddress ip = WiFi.localIP();
        if (ip[0] == 0 || ip[0] == 255) {
            LOG("[NET] DHCP timeout, IP still 0.0.0.0, retrying WiFi.begin...\n");
            WiFi.disconnect();
            delay(500);
            WiFi.begin(_savedSsid, _savedPass);
            uint32_t retryStart = millis();
            while (millis() - retryStart < 15000) {
                if (WiFi.status() == WL_CONNECTED) {
                    IPAddress rip = WiFi.localIP();
                    if (rip[0] != 0 && rip[0] != 255) break;
                }
                delay(500);
            }
        }
    }

    LOG("[NET] WiFi connected! IP: %s, SSID: %s\n",
        WiFi.localIP().toString().c_str(), WiFi.SSID());

    // NTP 时间同步（阻塞等待，北京时间）
    LOG("[NET] Starting NTP sync (blocking)...\n");
    _ntpUdp.begin(8889);
    syncNtpBlocking(20000);

    return true;
}

// ==================== NTP 阻塞同步 ====================
bool NetManager::syncNtpBlocking(uint32_t timeoutMs) {
    uint32_t startMs = millis();
    syncNtpTime();

    while (!_timeSynced && (millis() - startMs < timeoutMs)) {
        _handleNtp();
        delay(10);
    }

    if (_timeSynced) {
        LOG("[NTP] Blocking sync success\n");
        return true;
    } else {
        LOG("[NTP] Blocking sync FAILED after %lums, will retry in background\n",
            (unsigned long)(millis() - startMs));
        _ntpPending = false;
        _ntpRequestTime = millis();  // 让后台重试逻辑接管
        return false;
    }
}

// ==================== 启动会话 ====================
void NetManager::startSession() {
    // 使用 NTP 时间生成 sessionId（毫秒级，避免同一秒重启冲突）
    uint32_t tsSec = getCurrentTimeSec();
    uint16_t tsMs = getCurrentTimeMs();
    snprintf(_sessionId, sizeof(_sessionId), "%s_%lu%03u", _deviceId, tsSec, tsMs);

    _sessionActive = true;
    _lastIngestMs = millis();
    LOG("[NET] Session started: %s\n", _sessionId);
}

// ==================== NTP 时间同步 ====================
#define NTP_PACKET_SIZE 48
#define NTP_SERVER_IP  203, 107, 6, 88  // ntp.aliyun.com 固定IP，避免DNS查询导致hardfault
#define NTP_PORT 123
#define TIMEZONE_OFFSET (8 * 3600)  // 北京时间 UTC+8

void NetManager::syncNtpTime() {
    if (!_wifiConnected) return;

    IPAddress ntpIp(NTP_SERVER_IP);
    _ntpPending = true;
    _ntpRequestTime = millis();
    memset(_ntpPacketBuffer, 0, NTP_PACKET_SIZE);
    _ntpPacketBuffer[0] = 0b11100011;
    _ntpUdp.beginPacket(ntpIp, NTP_PORT);
    _ntpUdp.write(_ntpPacketBuffer, NTP_PACKET_SIZE);
    _ntpUdp.endPacket();
    LOG("[NTP] Request sent to 203.107.6.88\n");
}

void NetManager::_handleNtp() {
    int packetSize = _ntpUdp.parsePacket();
    if (packetSize >= NTP_PACKET_SIZE) {
        _ntpUdp.read(_ntpPacketBuffer, NTP_PACKET_SIZE);
        unsigned long highWord = word(_ntpPacketBuffer[40], _ntpPacketBuffer[41]);
        unsigned long lowWord = word(_ntpPacketBuffer[42], _ntpPacketBuffer[43]);
        unsigned long secsSince1900 = highWord << 16 | lowWord;
        const unsigned long seventyYears = 2208988800UL;
        _ntpBaseSec = secsSince1900 - seventyYears;
        _ntpBaseMs = millis();
        _timeSynced = true;
        _ntpPending = false;
        _ntpRetryCount = 0;

        char timeBuf[32];
        getTimeString(timeBuf, sizeof(timeBuf));
        LOG("[NTP] Sync OK: %s\n", timeBuf);
    }

    if (_ntpPending && (millis() - _ntpRequestTime > 5000)) {
        _ntpPending = false;
        _ntpRetryCount++;
        // 前3次快速重试（5秒间隔），之后降为30秒
        uint32_t retryInterval = (_ntpRetryCount <= 3) ? 5000 : 30000;
        LOG("[NTP] Sync timeout (retry #%d), will retry in %lus\n",
            _ntpRetryCount, retryInterval / 1000);
        _ntpRequestTime = millis();
    }
    if (!_timeSynced && !_ntpPending && (millis() - _ntpRequestTime > (_ntpRetryCount <= 3 ? 5000 : 30000))) {
        syncNtpTime();
    }
}

uint32_t NetManager::getCurrentTimeSec() {
    if (!_timeSynced) return 0;
    uint32_t elapsed = (millis() - _ntpBaseMs) / 1000;
    return _ntpBaseSec + elapsed;
}

uint16_t NetManager::getCurrentTimeMs() {
    if (!_timeSynced) return 0;
    return (uint16_t)((millis() - _ntpBaseMs) % 1000);
}

void NetManager::getTimeString(char* buf, size_t len) {
    if (!_timeSynced || buf == nullptr || len < 13) {
        if (buf && len > 0) buf[0] = '\0';
        return;
    }

    uint32_t epoch = getCurrentTimeSec();
    uint32_t msPart = (millis() - _ntpBaseMs) % 1000;

    uint32_t seconds = (epoch + TIMEZONE_OFFSET) % 86400;
    uint8_t h = seconds / 3600;
    uint8_t m = (seconds % 3600) / 60;
    uint8_t s = seconds % 60;

    snprintf(buf, len, "%02u:%02u:%02u.%03u", h, m, s, (unsigned)msPart);
}

void NetManager::_wifiTick() {
    // 1. WiFi 已连接
    if (WiFi.status() == WL_CONNECTED) {
        if (!_wifiConnected) {
            // 等待 DHCP 分配 IP
            uint32_t dhcpStart = millis();
            IPAddress ip;
            while (millis() - dhcpStart < 8000) {
                ip = WiFi.localIP();
                if (ip[0] != 0 && ip[0] != 255) break;
                delay(500);
            }
            _wifiConnected = true;
            _wifiDisconnectedSince = 0;
            LOG("[NET] WiFi reconnected (auto) IP: %s\n", ip.toString().c_str());
            // 重连成功，关闭 BLE 广播
            if (_onWifiReconnected) {
                _onWifiReconnected();
            }
        }
        return;
    }

    if (_provisioningActive) {
        return;
    }

    // 2. WiFi 已断开
    if (_wifiConnected) {
        _wifiConnected = false;
        _wifiDisconnectedSince = millis();
        _bleOpened = false;   // 重置 BLE 打开标志，下次断开时可以再打开
        LOG("[NET] WiFi disconnected, will retry...\n");
        // 立即尝试重连（使用保存的凭证）
        WiFi.begin(_savedSsid, _savedPass);
        return;
    }

    // 3. WiFi 一直断开，尝试重连
    if (_wifiDisconnectedSince > 0) {
        uint32_t elapsed = millis() - _wifiDisconnectedSince;

        // 每 5 秒重试一次
        if (elapsed % 5000 < 100) {   // 简单粗暴的 5 秒间隔
            LOG("[NET] WiFi retry connecting...\n");
            WiFi.begin(_savedSsid, _savedPass);   // 用保存的凭证重连
        }

        // 超过 1 分钟还连不上 → 打开 BLE（只调用一次）
        if (elapsed > 60000 && !_bleOpened && _onWifiLostTimeout) {
            LOG("[NET] WiFi lost > 1min, opening BLE for re-provisioning...\n");
            _onWifiLostTimeout();   // 打开 BLE 广播（不清除 EEPROM）
            _bleOpened = true;     // 防止重复调用
        }
    }
}

// 记录NTP时间戳（0表示未同步），云端fallback到服务器时间
bool NetManager::pushDataPoint(float rms, float act,
                                float mdf, float fatigue, uint8_t quality, bool calibrated) {
    // NTP未同步时跳过上传，避免时间戳为0的脏数据
    if (!_timeSynced) {
        return false;
    }

    uint32_t tsSec = getCurrentTimeSec();
    uint16_t ms = (uint16_t)((millis() - _ntpBaseMs) % 1000);

    // ===== 分钟统计累计（低质量帧不计入，避免开路噪声污染均值）=====
    if (quality >= 30) {
        _updateMinuteStats(rms, mdf, fatigue, quality);
    }

    // ===== 分钟边界检测 =====
    // 每60秒触发一次分钟统计上传
    if (tsSec > 0) {
        uint32_t currentMinute = tsSec / 60;
        uint32_t startMinute = _minuteStartSec / 60;
        if (_minuteStartSec > 0 && currentMinute > startMinute && _minuteCount > 0) {
            _uploadMinuteStats();
            _resetMinuteStats();
            _minuteStartSec = tsSec;
        }
        if (_minuteStartSec == 0) {
            _minuteStartSec = tsSec;
        }
    }

    if (_retryCount < INGEST_RETRY_QUEUE) {
        uint8_t idx = (_retryHead + _retryCount) % INGEST_RETRY_QUEUE;
        _retryQueue[idx].timestamp_sec = tsSec;
        _retryQueue[idx].ms = ms;
        _retryQueue[idx].rms = rms;
        _retryQueue[idx].act = act;
        _retryQueue[idx].mdf = mdf;
        _retryQueue[idx].fatigue = fatigue;
        _retryQueue[idx].quality = quality;
        _retryQueue[idx].calibrated = calibrated;
        _retryCount++;
    }

    if (_batchCount < INGEST_BATCH_FRAMES) {
        _batchBuffer[_batchCount].timestamp_sec = tsSec;
        _batchBuffer[_batchCount].ms = ms;
        _batchBuffer[_batchCount].rms = rms;
        _batchBuffer[_batchCount].act = act;
        _batchBuffer[_batchCount].mdf = mdf;
        _batchBuffer[_batchCount].fatigue = fatigue;
        _batchBuffer[_batchCount].quality = quality;
        _batchBuffer[_batchCount].calibrated = calibrated;
        _batchCount++;
        return true;
    }
    return false;
}

void NetManager::_checkIngest() {
    if (!_wifiConnected) return;
    if (_batchCount == 0) return;

    uint32_t now = millis();
    bool timeToSend = (now - _lastIngestMs >= 3000);
    bool bufferFull = (_batchCount >= INGEST_BATCH_FRAMES);

    if (!timeToSend && !bufferFull) return;

    _jsonBuf[0] = '\0';
    int pos = snprintf(_jsonBuf, sizeof(_jsonBuf),
             "{\"points\":[");

    for (uint8_t i = 0; i < _batchCount; i++) {
        if (i > 0) pos += snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos, ",");
        // 格式: [timestamp_sec, ms, rms, act, mdf, fatigue, quality, calibrated]
        //   calibrated: 1=已校准 0=未校准；云端据其决定"未校准"时激活度/疲劳度显示 '--'
        pos += snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos,
                 "[%lu,%u,%.3f,%.1f,%.1f,%.1f,%u,%d]",
                 (unsigned long)_batchBuffer[i].timestamp_sec,
                 (unsigned)_batchBuffer[i].ms,
                 _batchBuffer[i].rms,
                 _batchBuffer[i].act,
                 _batchBuffer[i].mdf,
                 _batchBuffer[i].fatigue,
                 (unsigned)_batchBuffer[i].quality,
                 _batchBuffer[i].calibrated ? 1 : 0);
    }
    snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos, "]}");

    bool ok = _httpPost(CLOUD_URL_DATA_INGEST, _jsonBuf);

    if (ok) {
        uint8_t uploadedFrames = _batchCount;
        _batchCount = 0;
        _lastIngestMs = now;

        if (_retryCount > 0) {
            if (_retryCount <= uploadedFrames) {
                _retryCount = 0;
                _retryHead = 0;
            } else {
                _retryCount -= uploadedFrames;
                _retryHead = (_retryHead + uploadedFrames) % INGEST_RETRY_QUEUE;
            }
        }
    } else {
        LOG("[NET] Upload FAIL — %d frames in retry queue\n", _retryCount);
        if (_batchCount > INGEST_BATCH_FRAMES / 2) {
            _batchCount = INGEST_BATCH_FRAMES / 2;
        }
    }
}

// ==================== HTTP POST — Robust HTTP/1.0 with Retry ====================
// 核心修复:
//   1. %zu → %lu 避免 Arduino 平台格式符不兼容导致 Content-Length 乱码
//   2. HTTP/1.0 避免 Transfer-Encoding 问题
//   3. \r\n\r\n 正确检测 header 结束（之前只检测 \r\n，导致解析错乱）
//   4. 添加 User-Agent 头避免被网关 WAF 拦截
//   5. 重试机制（2次尝试）
//   6. 超时从 15s 缩短到 8s

bool NetManager::_httpPost(const char* url, const char* jsonBody) {
    return _httpPost(url, jsonBody, nullptr);
}

bool NetManager::_httpPost(const char* url, const char* jsonBody, String* outBody) {
    // 解析 http://host/path
    const char* hostStart = url + 7;  // skip "http://"
    const char* pathStart = strchr(hostStart, '/');
    char host[128];
    int hostLen;
    if (pathStart) {
        hostLen = pathStart - hostStart;
        if (hostLen > 127) hostLen = 127;
        memcpy(host, hostStart, hostLen);
        host[hostLen] = '\0';
    } else {
        strncpy(host, hostStart, 127);
        host[127] = '\0';
        pathStart = "/";
    }

    unsigned long bodyLen = (unsigned long)strlen(jsonBody);

    // 预构建 HTTP 请求头
    char reqHeader[512];
    int hdrLen = snprintf(reqHeader, sizeof(reqHeader),
        "POST %s HTTP/1.0\r\n"
        "Host: %s\r\n"
        "User-Agent: sEMG-FW/3.2\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %lu\r\n"
        "Accept: application/json\r\n"
        "Connection: close\r\n"
        "\r\n",
        pathStart, host, bodyLen);

    // 重试循环
    for (int attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
            LOG("[NET] HTTP retry %d after 800ms...\n", attempt + 1);
            delay(800);
        }

        WiFiClient client;
        client.stop();  // ensure clean state
        delay(30);

        unsigned long tConn = millis();
        if (!client.connect(host, 80)) {
            LOG("[NET] TCP connect FAIL (attempt %d)\n", attempt + 1);
            client.stop();
            continue;
        }

        // 发送请求头
        size_t written = client.write((const uint8_t*)reqHeader, hdrLen);
        if (written != (size_t)hdrLen) {
            LOG("[NET] Header write fail: %lu/%d\n", (unsigned long)written, hdrLen);
            client.stop();
            continue;
        }

        // 短暂延迟让 WiFi 模块处理 header/body 边界
        delay(20);

        // 发送请求体
        written = client.write((const uint8_t*)jsonBody, bodyLen);
        if (written != (size_t)bodyLen) {
            LOG("[NET] Body write fail: %lu/%lu\n", (unsigned long)written, bodyLen);
            client.stop();
            continue;
        }

        client.flush();

        // 读取响应 — 用 \r\n\r\n 正确检测 header 结束
        unsigned long t0 = millis();
        String header, respBody;
        bool headerDone = false;

        while (millis() - t0 < 8000) {
            if (!client.connected() && !client.available()) break;

            while (client.available()) {
                char c = client.read();
                if (!headerDone) {
                    header += c;
                    int hLen = header.length();
                    // 精确检测 \r\n\r\n (header 结束标记)
                    if (hLen >= 4 &&
                        header[hLen-4] == '\r' && header[hLen-3] == '\n' &&
                        header[hLen-2] == '\r' && header[hLen-1] == '\n') {
                        headerDone = true;
                    }
                } else {
                    respBody += c;
                }
            }

            if (headerDone && !client.available()) break;
        }

        client.stop();

        if (header.length() == 0) {
            LOG("[NET] No response (attempt %d)\n", attempt + 1);
            continue;
        }

        if (outBody) *outBody = respBody;

        bool ok = (header.indexOf("200") > 0) || (header.indexOf("201") > 0);
        if (!ok) {
            LOG("[NET] HTTP error (attempt %d)\n", attempt + 1);
            int firstNL = header.indexOf('\n');
            if (firstNL > 0) {
                String statusLine = header.substring(0, firstNL);
                statusLine.trim();
                LOG("[NET] %s\n", statusLine.c_str());
            }
            if (respBody.length() > 0 && respBody.length() < 300) {
                LOG("[NET] Body: %s\n", respBody.c_str());
            }
        }
        return ok;
    }

    return false;
}

// ==================== HTTP GET — 阶段3 画像拉取 ====================
// 与 _httpPost 同构，但用 GET 且无请求体（Content-Length 省略）。
bool NetManager::_httpGet(const char* url, String* outBody) {
    const char* hostStart = url + 7;  // skip "http://"
    const char* pathStart = strchr(hostStart, '/');
    char host[128];
    int hostLen;
    if (pathStart) {
        hostLen = pathStart - hostStart;
        if (hostLen > 127) hostLen = 127;
        memcpy(host, hostStart, hostLen);
        host[hostLen] = '\0';
    } else {
        strncpy(host, hostStart, 127);
        host[127] = '\0';
        pathStart = "/";
    }

    char reqHeader[256];
    int hdrLen = snprintf(reqHeader, sizeof(reqHeader),
        "GET %s HTTP/1.0\r\n"
        "Host: %s\r\n"
        "User-Agent: sEMG-FW/3.2\r\n"
        "Accept: application/json\r\n"
        "Connection: close\r\n"
        "\r\n",
        pathStart, host);

    for (int attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) delay(800);
        WiFiClient client;
        client.stop();
        delay(30);
        if (!client.connect(host, 80)) {
            LOG("[NET] GET TCP connect FAIL (attempt %d)\n", attempt + 1);
            client.stop();
            continue;
        }
        size_t written = client.write((const uint8_t*)reqHeader, hdrLen);
        if (written != (size_t)hdrLen) {
            LOG("[NET] GET header write fail\n");
            client.stop();
            continue;
        }
        client.flush();
        unsigned long t0 = millis();
        String header, respBody;
        bool headerDone = false;
        while (millis() - t0 < 8000) {
            if (!client.connected() && !client.available()) break;
            while (client.available()) {
                char c = client.read();
                if (!headerDone) {
                    header += c;
                    int hLen = header.length();
                    if (hLen >= 4 &&
                        header[hLen-4]=='\r' && header[hLen-3]=='\n' &&
                        header[hLen-2]=='\r' && header[hLen-1]=='\n') {
                        headerDone = true;
                    }
                } else {
                    respBody += c;
                }
            }
            if (headerDone && !client.available()) break;
        }
        client.stop();
        if (header.length() == 0) continue;
        if (outBody) *outBody = respBody;
        bool ok = (header.indexOf("200") > 0);
        if (!ok) {
            LOG("[NET] GET HTTP error (attempt %d)\n", attempt + 1);
            continue;
        }
        return true;
    }
    return false;
}

// 从 JSON 响应中解析浮点字段；找不到或非法返回 -1.0f
float NetManager::_parseFloatField(const String& body, const char* key) {
    int idx = body.indexOf(key);
    if (idx < 0) return -1.0f;
    int colon = body.indexOf(':', idx);
    if (colon < 0) return -1.0f;
    int i = colon + 1;
    while (i < (int)body.length() && (body[i]==' ' || body[i]=='\t')) i++;
    if (i >= (int)body.length()) return -1.0f;
    int start = i;
    if (body[i]=='-') i++;
    int digits = 0;
    while (i < (int)body.length() && ((body[i]>='0'&&body[i]<='9') || body[i]=='.')) {
        if (body[i]>='0'&&body[i]<='9') digits++;
        i++;
    }
    if (digits == 0) return -1.0f;
    return body.substring(start, i).toFloat();
}

// ==================== 阶段3：拉取云端精炼画像并应用 ====================
void NetManager::fetchProfile() {
    if (!_onProfile) return;
    // 云端 HTTP 网关仅路由 POST（dataIngest / uploadCalibration / getDeviceCommand
    // 均为 POST 且工作正常）；GET 会被网关以非 200 拒绝（实测：TCP 已连上但响应非 200）。
    // 故此处复用 _httpPost（与 _checkCommand 同构），并借助其完整错误日志便于诊断。
    char jsonBody[128];
    snprintf(jsonBody, sizeof(jsonBody),
             "{\"device_id\":\"%s\"}", _deviceId);
    String respBody;
    bool ok = _httpPost(CLOUD_URL_GET_PROFILE, jsonBody, &respBody);
    if (!ok || respBody.length() == 0) {
        LOG("[NET] fetchProfile: no response\n");
        return;
    }
    if (respBody.indexOf("\"code\":404") >= 0 || respBody.indexOf("\"code\": 404") >= 0) {
        LOG("[NET] fetchProfile: no profile (404)\n");
        return;
    }
    float relax_rms  = _parseFloatField(respBody, "\"relax_rms\":");
    float relax_mdf  = _parseFloatField(respBody, "\"relax_mdf\":");
    float active_rms = _parseFloatField(respBody, "\"active_rms\":");
    float active_mdf = _parseFloatField(respBody, "\"active_mdf\":");
    float end_mdf    = _parseFloatField(respBody, "\"end_mdf\":");
    // 基本校验，避免污染基线
    if (relax_mdf <= 0 || active_mdf <= 0 || active_mdf <= relax_mdf ||
        active_rms <= 0 || relax_rms <= 0) {
        LOG("[NET] fetchProfile: invalid profile, skipped\n");
        return;
    }
    LOG("[NET] fetchProfile: relax={%.3f,%.1f} active={%.3f,%.1f} end_mdf=%.1f\n",
        relax_rms, relax_mdf, active_rms, active_mdf, end_mdf);
    _onProfile(relax_rms, active_rms, relax_mdf, active_mdf, end_mdf);
}

void NetManager::uploadCalibration(float relaxRms, float relaxMdf,
                                    float activeRms, float activeMdf) {
    _relaxRms = relaxRms;
    _relaxMdf = relaxMdf;
    _activeRms = activeRms;
    _activeMdf = activeMdf;
    _calibReady = true;

    LOG("[NET] Calib saved: relax={%.3f,%.1f} active={%.3f,%.1f}\n",
        relaxRms, relaxMdf, activeRms, activeMdf);
}

void NetManager::uploadCalibPhase(const char* phase, float rms, float mdf,
                                   float endMdf) {
    char json[256];
    if (endMdf > 0.0f) {
        snprintf(json, sizeof(json),
            "{\"device_id\":\"%s\",\"phase\":\"%s\",\"rms\":%.3f,\"mdf\":%.1f,\"end_mdf\":%.1f}",
            _deviceId, phase, rms, mdf, endMdf);
    } else {
        snprintf(json, sizeof(json),
            "{\"device_id\":\"%s\",\"phase\":\"%s\",\"rms\":%.3f,\"mdf\":%.1f}",
            _deviceId, phase, rms, mdf);
    }
    LOG("[NET] Uploading calib phase %s: rms=%.3f mdf=%.1f\n", phase, rms, mdf);
    bool ok = _httpPost(CLOUD_URL_UPLOAD_CALIB, json);
    LOG("[NET] Calib phase %s upload: %s\n", phase, ok ? "OK" : "FAIL");
}

void NetManager::updateSavedCredentials(const char* ssid, const char* pass) {
    strncpy(_savedSsid, ssid, sizeof(_savedSsid) - 1);
    _savedSsid[sizeof(_savedSsid) - 1] = '\0';
    strncpy(_savedPass, pass, sizeof(_savedPass) - 1);
    _savedPass[sizeof(_savedPass) - 1] = '\0';
    LOG("[NET] Reconnect credentials updated: %s\n", _savedSsid);
}

void NetManager::tick() {
    _wifiTick();
    _handleNtp();

    // NTP后台同步成功后自动启动会话（处理阻塞同步失败的情况）
    if (_timeSynced && !_sessionActive && _wifiConnected) {
        startSession();
    }

    _checkIngest();

    // 阶段3：会话启动后拉取一次云端精炼画像（纵向学习），仅触发一次
    if (_sessionActive && !_profileFetched) {
        _profileFetched = true;
        fetchProfile();
    }

    uint32_t now = millis();
    // 命令轮询间隔：3秒（原10秒太长，导致校准指令延迟、relax阶段数据来不及显示）
    if (_wifiConnected && now - _lastCommandCheck >= 3000) {
        _lastCommandCheck = now;
        _checkCommand();
    }

    if (_wifiConnected && now - _lastStatusReport >= 60000) {
        _lastStatusReport = now;
        _reportStatus();
    }
}

void NetManager::_checkCommand() {
    char jsonBody[128];
    snprintf(jsonBody, sizeof(jsonBody),
             "{\"device_id\":\"%s\"}", _deviceId);

    String respBody;
    bool ok = _httpPost(CLOUD_URL_GET_COMMAND, jsonBody, &respBody);

    if (!ok || respBody.length() == 0) return;

    // 解析响应: {"code":0,"command":{"id":"...","command":"..."}}
    char cmdId[64] = {0};
    char cmdName[64] = {0};

    int idIdx = respBody.indexOf("\"id\"");
    if (idIdx > 0) {
        int colonIdx = respBody.indexOf(':', idIdx);
        if (colonIdx > 0) {
            int q1 = respBody.indexOf('"', colonIdx);
            int q2 = respBody.indexOf('"', q1 + 1);
            if (q1 > 0 && q2 > q1) {
                String tmp = respBody.substring(q1 + 1, q2);
                strncpy(cmdId, tmp.c_str(), sizeof(cmdId) - 1);
            }
        }
    }

    // 用 "\"command\":\"" 精确匹配内层字符串字段
    // 避免误匹配到外层 "command":{"id":...,"command":"xxx"} 的对象 key
    int cmdIdx = respBody.indexOf("\"command\":\"");
    if (cmdIdx < 0) return;
    int valStart = cmdIdx + 11; // strlen("\"command\":\"") = 11
    int q2 = respBody.indexOf('"', valStart);
    if (q2 < 0) return;
    String tmp = respBody.substring(valStart, q2);
    strncpy(cmdName, tmp.c_str(), sizeof(cmdName) - 1);

    LOG("[NET] Received command: %s (id=%s)\n", cmdName, cmdId);
    _lastCommandId[0] = '\0';
    if (strlen(cmdId) > 0) {
        strncpy(_lastCommandId, cmdId, sizeof(_lastCommandId) - 1);
    }

    // 解析 params 字段
    _lastParams[0] = '\0';
    int paramsIdx = respBody.indexOf("\"params\":");
    if (paramsIdx > 0) {
        int braceStart = respBody.indexOf('{', paramsIdx);
        if (braceStart > 0) {
            int braceEnd = respBody.indexOf('}', braceStart);
            if (braceEnd > braceStart) {
                String paramsStr = respBody.substring(braceStart, braceEnd + 1);
                strncpy(_lastParams, paramsStr.c_str(), sizeof(_lastParams) - 1);
            }
        }
    }

    _executeCommand(cmdName, _lastParams);
}

void NetManager::_executeCommand(const char* command, const char* paramsJson) {
    LOG("[NET] Executing command: %s\n", command);

    if (strcmp(command, "reset_wifi") == 0) {
        LOG("[NET] Executing reset_wifi via callback\n");
        if (_onResetWifi) {
            _onResetWifi();
        }
    }
    else if (strcmp(command, "refresh_status") == 0) {
        LOG("[NET] Refreshing status...\n");
        _reportStatus();
    }
    else if (strcmp(command, "record_relax") == 0) {
        LOG("[NET] Executing record_relax via callback\n");
        if (_onRecordRelax) {
            _onRecordRelax();
        }
    }
    else if (strcmp(command, "record_active") == 0) {
        LOG("[NET] Executing record_active via callback\n");
        if (_onRecordActive) {
            _onRecordActive();
        }
    }
    else if (strcmp(command, "save_calib") == 0) {
        LOG("[NET] Executing save_calib via callback, params=%s\n", paramsJson);
        if (_onSaveCalib) {
            _onSaveCalib(paramsJson);
        }
    }
    else if (strcmp(command, "reset_calib") == 0) {
        LOG("[NET] Executing reset_calib via callback\n");
        if (_onResetCalib) {
            _onResetCalib();
        }
    }
    else {
        LOG("[NET] Unknown command: %s\n", command);
    }

    // Acknowledge command after execution
    if (strlen(_lastCommandId) > 0) {
        _ackCommand(_lastCommandId);
        _lastCommandId[0] = '\0';
    }
}

void NetManager::_reportStatus() {
    char json[512];
    snprintf(json, sizeof(json),
        "{\"device_id\":\"%s\",\"ip\":\"%s\",\"ssid\":\"%s\",\"status\":\"online\"}",
        _deviceId,
        WiFi.localIP().toString().c_str(),
        WiFi.SSID());

    // LOG("[NET] Reporting status: IP=%s, SSID=%s\n",
    //     WiFi.localIP().toString().c_str(), WiFi.SSID());
    _httpPost(CLOUD_URL_REPORT_STATUS, json);
}

void NetManager::_ackCommand(const char* commandId) {
    char json[256];
    snprintf(json, sizeof(json),
        "{\"command_id\":\"%s\",\"status\":\"done\"}",
        commandId);
    _httpPost(CLOUD_URL_ACK_COMMAND, json);
}

// ==================== 分钟统计辅助函数 ====================

void NetManager::_updateMinuteStats(float rms, float mdf, float fatigue, uint8_t quality) {
    if (quality < 30) return;  // 低质量/开路帧不计入分钟统计
    _rmsSum += rms;
    if (rms > _rmsMax) _rmsMax = rms;
    if (rms < _rmsMin) _rmsMin = rms;

    _mdfSum += mdf;
    if (mdf > _mdfMax) _mdfMax = mdf;

    _fatigueSum += fatigue;
    if (fatigue > _fatigueMax) _fatigueMax = fatigue;

    _qualitySum += quality;
    _minuteCount++;
}

void NetManager::_resetMinuteStats() {
    _rmsSum = 0;
    _rmsMax = 0;
    _rmsMin = 999999;
    _mdfSum = 0;
    _mdfMax = 0;
    _fatigueSum = 0;
    _fatigueMax = 0;
    _qualitySum = 0;
    _minuteCount = 0;
}

void NetManager::_uploadMinuteStats() {
    if (_minuteCount == 0 || !_wifiConnected) return;

    // 计算平均值（保留原始整数精度）
    float rmsAvg = _rmsSum / _minuteCount;
    float mdfAvg = _mdfSum / _minuteCount;
    float fatigueAvg = _fatigueSum / _minuteCount;
    float qualityAvg = (float)_qualitySum / _minuteCount;

    // 分钟起始时间（秒级，云端转毫秒）
    uint32_t minuteTsSec = _minuteStartSec;

    char json[512];
    snprintf(json, sizeof(json),
        "{\"device_id\":\"%s\",\"timestamp\":%lu,"
        "\"rms_avg\":%.3f,\"rms_max\":%.3f,\"rms_min\":%.3f,"
        "\"mdf_avg\":%.1f,\"mdf_max\":%.1f,"
        "\"fatigue_avg\":%.1f,\"fatigue_max\":%.1f,"
        "\"quality_avg\":%.1f,\"count\":%u}",
        _deviceId, (unsigned long)minuteTsSec,
        rmsAvg, _rmsMax, _rmsMin,
        mdfAvg, _mdfMax,
        fatigueAvg, _fatigueMax,
        qualityAvg, (unsigned)_minuteCount);

    // LOG("[NET] Uploading minute stats: ts=%lu, count=%u\n",
    //     (unsigned long)minuteTsSec, (unsigned)_minuteCount);
    bool ok = _httpPost(CLOUD_URL_UPLOAD_STATS, json);
    // LOG("[NET] Minute stats upload: %s\n", ok ? "OK" : "FAIL");
}