import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 替换常量表（去掉 WS 相关，保留有用项）
old_const_block = ('| FIRMWARE_VERSION | "1.0" | Config.h |\n'
                  '| LOOP_INTERVAL_MS | 100 | Board.h |\n'
                  '| CALIB_RELAX_SEC | 10 | Board.h |\n'
                  '| CALIB_ACTIVE_SEC | 15 | Board.h |\n'
                  '| RING_BUFFER_SIZE | 512 | SignalProcessor.h |\n'
                  '| FFT_WINDOW | 256 | SignalProcessor.h |\n'
                  '| MDF_MIN_FREQ | 10.0 Hz | SignalProcessor |\n'
                  '| MDF_MAX_FREQ | 250.0 Hz | SignalProcessor |\n'
                  '| FATIGUE_FLOOR/CEIL | 0/200 | Board.h |\n'
                  '| ADC_REF_MV | 5000.0 | Board.h |\n'
                  '| ADC_MAX_VALUE | 16383 | Board.h |\n'
                  '| INGEST_BATCH_FRAMES | 10 | NetManager.h |\n'
                  '| INGEST_RETRY_QUEUE | 150 | NetManager.h |\n'
                  '| BLE_SERVICE_UUID | 19B10000-... | BleConfigServer.h |\n'
                  '| MAX_HISTORY | 5 | realtime/index.js |\n'
                  '| NO_ROUTE_MAX_RETRIES | 5 | wifiClient.js (v10.3) |\n'
                  '| WS_IDLE_TIMEOUT_MS | 30000 | NetManager.cpp (v3.9.40) |\n'
                  '| CMD_TIMEOUT_MS | 8000 | wifiClient.js |\n'
                  '| ON_SHOW_RECONNECT_DELAY | 3000 | app.js (v10.3) |')

new_const_block = ('| FIRMWARE_VERSION | "1.0" | Config.h |\n'
                  '| LOOP_INTERVAL_MS | 100 | Board.h |\n'
                  '| CALIB_RELAX_SEC | 10 | Board.h |\n'
                  '| CALIB_ACTIVE_SEC | 15 | Board.h |\n'
                  '| RING_BUFFER_SIZE | 512 | SignalProcessor.h |\n'
                  '| FFT_WINDOW | 256 | SignalProcessor.h |\n'
                  '| MDF_MIN_FREQ | 10.0 Hz | SignalProcessor |\n'
                  '| MDF_MAX_FREQ | 250.0 Hz | SignalProcessor |\n'
                  '| FATIGUE_FLOOR/CEIL | 0/200 | Board.h |\n'
                  '| ADC_REF_MV | 5000.0 | Board.h |\n'
                  '| ADC_MAX_VALUE | 16383 | Board.h |\n'
                  '| INGEST_BATCH_FRAMES | 10 | NetManager.h |\n'
                  '| INGEST_RETRY_QUEUE | 150 | NetManager.h |\n'
                  '| BLE_SERVICE_UUID | 19B10000-... | BleConfigServer.h |\n'
                  '| MAX_HISTORY | 5 | realtime/index.js |\n'
                  '| CMD_TIMEOUT_MS | 8000 | wifiClient.js |\n'
                  '| ON_SHOW_RECONNECT_DELAY | 3000 | app.js |')

if old_const_block in content:
    content = content.replace(old_const_block, new_const_block)
    print('Replaced constants table')
else:
    print('WARNING: constants table not found exactly, trying partial...')
    # 只替换 WS_IDLE_TIMEOUT_MS 那一行
    content = content.replace('| WS_IDLE_TIMEOUT_MS | 30000 | NetManager.cpp (v3.9.40) |\n', '')
    print('Removed WS_IDLE_TIMEOUT_MS line')

f.write_text(content, encoding='utf-8')
print('Done')
