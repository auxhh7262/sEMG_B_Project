// NetManager.cpp — Cloud Version V3.1 (HTTP Mode - No HTTPS Issues)
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
    , _wifiDisconnectedSince(0)
{
    memset(_deviceId, 0, sizeof(_deviceId));
    memset(_sessionId, 0, sizeof(_sessionId));
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

    delay(1000);

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
        while (millis() - dhcpStart < 5000) {
            IPAddress ip = WiFi.localIP();
            if (ip[0] != 0 && ip[0] != 255) break;
            delay(500);
        }
    }

    LOG("[NET] WiFi connected! IP: %s, SSID: %s\n",
        WiFi.localIP().toString().c_str(), WiFi.SSID());

    char json[256];
    snprintf(json, sizeof(json),
             "{\"device_id\":\"%s\",\"firmware_ver\":\"v2.0.0\"}",
             _deviceId);
    LOG("[NET] Registering device...\n");
    bool registered = _httpPost(CLOUD_URL_DEVICE_REGISTER, json);
    LOG("[NET] Device register: %s\n", registered ? "OK" : "FAIL");

    uint32_t now = millis();
    snprintf(_sessionId, sizeof(_sessionId), "%s_%lu", _deviceId, now);
    _sessionActive = true;
    _lastIngestMs = now;

    LOG("[NET] Session started: %s\n", _sessionId);
    return true;
}

void NetManager::_wifiTick() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!_wifiConnected) {
            _wifiConnected = true;
            _wifiDisconnectedSince = 0;
            LOG("[NET] WiFi reconnected (auto)\n");
        }
        return;
    }

    if (_wifiConnected) {
        _wifiConnected = false;
        _wifiDisconnectedSince = millis();
        LOG("[NET] WiFi disconnected\n");
        return;
    }

    if (_wifiDisconnectedSince > 0 && _onWifiLostTimeout) {
        uint32_t elapsed = millis() - _wifiDisconnectedSince;
        if (elapsed > 300000) {
            LOG("[NET] WiFi lost > 5min, triggering provisioning mode\n");
            _wifiDisconnectedSince = 0;
            _onWifiLostTimeout();
        }
    }
}

bool NetManager::pushDataPoint(uint32_t ts, float rms, float act,
                                float mdf, float fatigue, uint8_t quality) {
    if (_retryCount < INGEST_RETRY_QUEUE) {
        uint8_t idx = (_retryHead + _retryCount) % INGEST_RETRY_QUEUE;
        _retryQueue[idx].ts = ts;
        _retryQueue[idx].rms = rms;
        _retryQueue[idx].act = act;
        _retryQueue[idx].mdf = mdf;
        _retryQueue[idx].fatigue = fatigue;
        _retryQueue[idx].quality = quality;
        _retryCount++;
    }

    if (_batchCount < INGEST_BATCH_FRAMES) {
        _batchBuffer[_batchCount].ts = ts;
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
             "{\"session_id\":\"%s\",\"device_id\":\"%s\",\"points\":[",
             _sessionActive ? _sessionId : "", _deviceId);

    for (uint8_t i = 0; i < _batchCount; i++) {
        if (i > 0) pos += snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos, ",");
        pos += snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos,
                 "{\"ts\":%lu,\"rms\":%d,\"act\":%d,\"mdf\":%d,\"fatigue\":%d,\"quality\":%d}",
                 _batchBuffer[i].ts,
                 (int)(_batchBuffer[i].rms * 1000),
                 (int)(_batchBuffer[i].act * 10),
                 (int)(_batchBuffer[i].mdf * 10),
                 (int)(_batchBuffer[i].fatigue * 10),
                 _batchBuffer[i].quality);
    }
    snprintf(_jsonBuf + pos, sizeof(_jsonBuf) - pos, "]}");

    LOG("[NET] Uploading %d frames...\n", _batchCount);
    bool ok = _httpPost(CLOUD_URL_DATA_INGEST, _jsonBuf);

    if (ok) {
        uint8_t uploadedFrames = _batchCount;
        LOG("[NET] Upload OK (%d frames)\n", uploadedFrames);
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

// ==================== HTTP POST (Simplified - No HTTPS) ====================
bool NetManager::_httpPost(const char* url, const char* jsonBody) {
    WiFiClient client;

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

    if (!client.connect(host, 80)) {
        LOG("[NET] TCP connect FAIL to %s\n", host);
        return false;
    }

    size_t bodyLen = strlen(jsonBody);

    char req[768];
    int reqLen = snprintf(req, sizeof(req),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n",
        pathStart, host, bodyLen);

    client.write((const uint8_t*)req, reqLen);
    client.write((const uint8_t*)jsonBody, bodyLen);
    client.flush();

    // 读取响应
    unsigned long t0 = millis();
    String statusLine;
    String body;
    bool headerDone = false;

    while (millis() - t0 < 5000) {
        while (client.available()) {
            char c = client.read();
            if (!headerDone) {
                if (c == '\n' && statusLine.endsWith("\r\n")) {
                    headerDone = true;
                    statusLine.trim();
                    body = "";
                    continue;
                }
                statusLine += c;
            } else {
                body += c;
            }
        }
    }

    client.stop();

    LOG("[NET] HTTP Status: %s\n", statusLine.c_str());
    if (body.length() > 0) {
        LOG("[NET] HTTP Body: %s\n", body.c_str());
    }

    bool ok = (statusLine.indexOf("200") > 0) || (statusLine.indexOf("201") > 0);
    return ok;
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

void NetManager::tick() {
    _wifiTick();
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
    WiFiClient client;

    char host[128];
    const char* url = CLOUD_URL_GET_COMMAND;
    const char* hostStart = url + 7;
    const char* pathStart = strchr(hostStart, '/');
    int hostLen = pathStart ? (pathStart - hostStart) : (int)strlen(hostStart);
    if (hostLen > 127) hostLen = 127;
    memcpy(host, hostStart, hostLen);
    host[hostLen] = '\0';

    if (!client.connect(host, 80)) {
        LOG("[NET] TCP connect FAIL for command check\n");
        return;
    }

    char req[512];
    int reqLen = snprintf(req, sizeof(req),
        "GET %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "Connection: close\r\n"
        "\r\n",
        pathStart ? pathStart : "/", host);

    client.write((const uint8_t*)req, reqLen);
    client.flush();

    unsigned long t0 = millis();
    String body;
    bool headerDone = false;
    while (millis() - t0 < 5000) {
        if (client.available()) {
            char c = client.read();
            if (!headerDone) {
                if (c == '\n' && body.endsWith("\r\n\r\n")) {
                    headerDone = true;
                    body = "";
                    continue;
                }
                body += c;
            } else {
                body += c;
            }
        }
    }
    client.stop();

    if (body.length() > 0) {
        int cmdIdx = body.indexOf("\"command\"");
        if (cmdIdx > 0) {
            int cmdStart = body.indexOf(':', cmdIdx);
            if (cmdStart > 0) {
                int valStart = body.indexOf('"', cmdStart);
                int valEnd = body.indexOf('"', valStart + 1);
                if (valStart > 0 && valEnd > valStart) {
                    String cmd = body.substring(valStart + 1, valEnd);
                    LOG("[NET] Received command: %s\n", cmd.c_str());
                    _executeCommand(cmd.c_str(), "");
                }
            }
        }
    }
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
    else {
        LOG("[NET] Unknown command: %s\n", command);
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