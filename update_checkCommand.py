import pathlib

f = pathlib.Path('E:/sEMG_B_Project/firmware/src/3_Network/NetManager.cpp')
content = f.read_text(encoding='utf-8')

# 替换 _checkCommand 函数
old_func = '''void NetManager::_checkCommand() {
    WiFiClient client;

    char host[128];
    const char* url = CLOUD_URL_GET_COMMAND;
    const char* hostStart = url + 7;
    const char* pathStart = strchr(hostStart, '/');
    int hostLen = pathStart ? (pathStart - hostStart) : (int)strlen(hostStart);
    if (hostLen > 127) hostLen = 127;
    memcpy(host, hostStart, hostLen);
    host[hostLen] = \'\\0\';

    if (!client.connect(host, 80)) {
        LOG("[NET] TCP connect FAIL for command check\\n");
        return;
    }

    char req[512];
    int reqLen = snprintf(req, sizeof(req),
        "GET %s HTTP/1.1\\r\\n"
        "Host: %s\\r\\n"
        "Connection: close\\r\\n"
        "\\r\\n",
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
                if (c == \'\\n\' && body.endsWith("\\r\\n\\r\\n")) {
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
        int cmdIdx = body.indexOf("\\"command\\"");
        if (cmdIdx > 0) {
            int cmdStart = body.indexOf(\':\', cmdIdx);
            if (cmdStart > 0) {
                int valStart = body.indexOf(\'"\', cmdStart);
                int valEnd = body.indexOf(\'"\', valStart + 1);
                if (valStart > 0 && valEnd > valStart) {
                    String cmd = body.substring(valStart + 1, valEnd);
                    LOG("[NET] Received command: %s\\n", cmd.c_str());
                    _executeCommand(cmd.c_str(), "");
                }
            }
        }
    }
}'''

new_func = '''void NetManager::_checkCommand() {
    // POST JSON body: {"device_id":"..."}
    char jsonBody[128];
    snprintf(jsonBody, sizeof(jsonBody),
             "{\\"device_id\\":\\"%s\\"}", _deviceId);

    char host[128];
    const char* url = CLOUD_URL_GET_COMMAND;
    const char* hostStart = strstr(url, "://") + 3;
    const char* pathStart = strchr(hostStart, \'/\');
    int hostLen = pathStart ? (pathStart - hostStart) : (int)strlen(hostStart);
    if (hostLen > 127) hostLen = 127;
    memcpy(host, hostStart, hostLen);
    host[hostLen] = \'\\0\';
    const char* path = pathStart ? pathStart : "/";

    WiFiClient client;
    if (!client.connect(host, 80)) {
        LOG("[NET] TCP connect FAIL for command check\\n");
        return;
    }

    // Send POST request
    char req[384];
    int reqLen = snprintf(req, sizeof(req),
        "POST %s HTTP/1.1\\r\\n"
        "Host: %s\\r\\n"
        "Content-Type: application/json\\r\\n"
        "Content-Length: %d\\r\\n"
        "Connection: close\\r\\n"
        "\\r\\n",
        path, host, (int)strlen(jsonBody));
    client.write((const uint8_t*)req, reqLen);
    client.write((const uint8_t*)jsonBody, strlen(jsonBody));
    client.flush();

    // Read response
    unsigned long t0 = millis();
    String body;
    bool headerDone = false;
    while (millis() - t0 < 5000) {
        if (client.available()) {
            char c = client.read();
            if (!headerDone) {
                if (c == \'\\n\' && body.endsWith("\\r\\n\\r\\n")) {
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

    if (body.length() == 0) return;

    // Parse JSON response (expect: {"code":0,"command":{"id":"...","command":"...",...}})
    // Simple parser: extract "id" and "command" fields
    char cmdId[64] = {0};
    char cmdName[64] = {0};

    int idIdx = body.indexOf("\\"id\\"");
    if (idIdx > 0) {
        int colonIdx = body.indexOf(\':\', idIdx);
        if (colonIdx > 0) {
            int q1 = body.indexOf(\'"\', colonIdx);
            int q2 = body.indexOf(\'"\', q1 + 1);
            if (q1 > 0 && q2 > q1) {
                String tmp = body.substring(q1 + 1, q2);
                strncpy(cmdId, tmp.c_str(), sizeof(cmdId) - 1);
            }
        }
    }

    int cmdIdx = body.indexOf("\\"command\\"");
    if (cmdIdx < 0) return;  // no pending command
    int colonIdx = body.indexOf(\':\', cmdIdx);
    if (colonIdx < 0) return;
    int q1 = body.indexOf(\'"\', colonIdx);
    int q2 = body.indexOf(\'"\', q1 + 1);
    if (q1 < 0 || q2 < 0) return;
    String tmp = body.substring(q1 + 1, q2);
    strncpy(cmdName, tmp.c_str(), sizeof(cmdName) - 1);

    LOG("[NET] Received command: %s (id=%s)\\n", cmdName, cmdId);
    _lastCommandId[0] = \'\\0\';
    if (strlen(cmdId) > 0) {
        strncpy(_lastCommandId, cmdId, sizeof(_lastCommandId) - 1);
    }
    _executeCommand(cmdName, "");
}'''

if old_func in content:
    content = content.replace(old_func, new_func)
    print('Replaced _checkCommand successfully')
else:
    print('ERROR: old_func not found')
    # Try to find similar text
    idx = content.find('_checkCommand')
    if idx >= 0:
        print('Found _checkCommand at position', idx)
        print('Context:', content[idx:idx+200])

f.write_text(content, encoding='utf-8')
print('Done!')
