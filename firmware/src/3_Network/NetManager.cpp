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
    , _onResetWifi(nullptr)
    , _onWifiLostTimeout(nullptr)
    , _onRecordRelax(nullptr)
    , _onRecordActive(nullptr)
    , _onSaveCalib(nullptr)
    , _wifiDisconnectedSince(0)
    , _bleOpened(false)
    , _provisioningActive(false)
    , _timeSynced(false)
    , _ntpBaseSec(0)
    , _ntpBaseMs(0)
    , _ntpPending(false)
    , _ntpRequestTime(0)
{
    memset(_deviceId, 0, sizeof(_deviceId));
    memset(_sessionId, 0, sizeof(_sessionId));
    memset(_lastCommandId, 0, sizeof(_lastCommandId));
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

    // 等待 2 秒让网络稳定
    LOG("[NET] Waiting 2s for network to stabilize...\n");
    delay(2000);

    // NTP 时间同步（后台异步，北京时间）
    LOG("[NET] Starting NTP sync (background)...\n");
    _ntpUdp.begin(8889);
    syncNtpTime();

    // 跳过注册，直接开始会话
    LOG("[NET] Session started: %s\n", _sessionId);
    _sessionActive = true;
    _lastIngestMs = millis();
    LOG("[NET] Skipping registration, session active.\n");
    return true;
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
        _ntpBaseSec = secsSince1900 - seventyYears + TIMEZONE_OFFSET;
        _ntpBaseMs = millis();
        _timeSynced = true;
        _ntpPending = false;

        char timeBuf[32];
        getTimeString(timeBuf, sizeof(timeBuf));
        LOG("[NTP] Sync OK: %s\n", timeBuf);
    }

    if (_ntpPending && (millis() - _ntpRequestTime > 5000)) {
        _ntpPending = false;
        LOG("[NTP] Sync timeout, will retry in 60s\n");
        _ntpRequestTime = millis();
    }
    if (!_timeSynced && !_ntpPending && (millis() - _ntpRequestTime > 60000)) {
        syncNtpTime();
    }
}

uint32_t NetManager::getCurrentTimeSec() {
    if (!_timeSynced) return 0;
    uint32_t elapsed = (millis() - _ntpBaseMs) / 1000;
    return _ntpBaseSec + elapsed;
}

void NetManager::getTimeString(char* buf, size_t len) {
    if (!_timeSynced || buf == nullptr || len < 13) {
        if (buf && len > 0) buf[0] = '\0';
        return;
    }

    uint32_t epoch = getCurrentTimeSec();
    uint32_t msPart = (millis() - _ntpBaseMs) % 1000;

    uint32_t seconds = epoch % 86400;
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

// 云端使用服务器时间，无需上传 ts 字段
bool NetManager::pushDataPoint(float rms, float act,
                                float mdf, float fatigue, uint8_t quality) {
    if (_retryCount < INGEST_RETRY_QUEUE) {
        uint8_t idx = (_retryHead + _retryCount) % INGEST_RETRY_QUEUE;
        _retryQueue[idx].rms = rms;
        _retryQueue[idx].act = act;
        _retryQueue[idx].mdf = mdf;
        _retryQueue[idx].fatigue = fatigue;
        _retryQueue[idx].quality = quality;
        _retryCount++;
    }

    if (_batchCount < INGEST_BATCH_FRAMES) {
        _batchBuffer[_batchCount].rms = rms;
        _batchBuffer[_batchCount].act = act;
        _batchBuffer[_batchCount].mdf = mdf;
        _batchBuffer[_batchCount].fatigue = fatigue;
        _batchBuffer[_batchCount].quality = quality;
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
        pos += snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos,
                 "[%d,%d,%d,%d,%d]",
                 (int)(_batchBuffer[i].rms * 1000),
                 (int)(_batchBuffer[i].act * 10),
                 (int)(_batchBuffer[i].mdf * 10),
                 (int)(_batchBuffer[i].fatigue * 10),
                 _batchBuffer[i].quality);
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
    _checkIngest();

    uint32_t now = millis();
    if (_wifiConnected && now - _lastCommandCheck >= 10000) {
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
    _executeCommand(cmdName, "");
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
        LOG("[NET] Executing save_calib via callback\n");
        if (_onSaveCalib) {
            _onSaveCalib();
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

    LOG("[NET] Reporting status: IP=%s, SSID=%s\n",
        WiFi.localIP().toString().c_str(), WiFi.SSID());
    _httpPost(CLOUD_URL_REPORT_STATUS, json);
}

void NetManager::_ackCommand(const char* commandId) {
    char json[256];
    snprintf(json, sizeof(json),
        "{\"command_id\":\"%s\",\"status\":\"done\"}",
        commandId);
    _httpPost(CLOUD_URL_ACK_COMMAND, json);
}