import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

old_arch = ('## 1. 系统架构\n'
            '\n'
            '```\n'
            '┌──────────────────────────────┐      WebSocket(8888)      ┌─────────────────────┐\n'
            '│       固件端 (Arduino)        │ ◄──────────────────────► │  微信小程序 (前端)     │\n'
            '│                              │    JSON 命令/数据帧         │                     │\n'
            '│  main.cpp                    │                           │  app.js             │\n'
            '│    ├── ADC Timer ISR (1kHz)  │                           │  utils/             │\n'
            '│    ├── Loop (100ms/10Hz)     │                           │    wifiClient.js    │\n'
            '│    │                           │                           │    bleClient.js     │\n'
            '│  SignalProcessor             │                           │    storage.js       │\n'
            '│    ├── Ring Buffer (512)     │                           │                     │\n'
            '│    ├── RMS (256pt window)    │                           │  pages/             │\n'
            '│    ├── FFT (256pt, 自实现)    │                           │    network/         │\n'
            '│    ├── MDF (10-250Hz)        │                           │    calibrate/       │\n'
            '│    ├── Fatigue (动态基线)     │                           │    realtime/        │\n'
            '│    └── Activation            │                           │    analysis/        │\n'
            '│                              │                           └─────────────────────┘\n'
            '│  AppController (业务调度)     │\n'
            '│    ├── 校准流程管理            │       BLE (19B10000)      ┌─────────────────────┐\n'
            '│    └── 实时数据广播            │ ◄──────────────────────► │  小程序配网流程       │\n'
            '│                              │   SSID/Password → IP回传  │  (仅network页面)      │\n'
            '│  StorageManager              │                           └─────────────────────┘\n'
            '│    └── EEPROM: WiFi凭证+校准+用户信息 │\n'
            '│                              │\n'
            '│  NetManager                  │\n'
            '│    ├── WiFi STA 连接          │\n'
            '│    ├── WebSocket Server       │\n'
            '│    └── NTP 时间同步           │\n'
            '│                              │\n'
            '│  BleConfigServer             │\n'
            '│    └── BLE Peripheral 广播    │\n'
            '└──────────────────────────────┘\n'
            '```')

new_arch = ('## 1. 系统架构\n'
            '\n'
            '```\n'
            '┌──────────────────────────────┐  HTTP POST  ┌──────────────────────┐\n'
            '│       固件端 (Arduino)        │ ──────────► │  微信云开发             │\n'
            '│  (Arduino UNO R4 WiFi)       │  /dataIngest│  ├─ dataIngest        │\n'
            '│                              │             │  ├─ deviceRegister     │\n'
            '│  main.cpp                    │  BLE配网    │  ├─ getDeviceCommand  │\n'
            '│    ├── ADC Timer ISR (1kHz)  │ ◄────────  │  └─ reportDeviceStatus│\n'
            '│    ├── Loop (100ms/10Hz)     │             └──────────┬───────────┘\n'
            '│                              │                        │ 云数据库查询\n'
            '│  SignalProcessor             │                        ▼\n'
            '│    ├── Ring Buffer (512)     │ 云函数调用  ┌──────────────────────┐\n'
            '│    ├── RMS (256pt window)    │ ◄───────── │  微信小程序 (前端)      │\n'
            '│    ├── FFT (256pt, 自实现)    │             │                      │\n'
            '│    ├── MDF (10-250Hz)        │             │  app.js              │\n'
            '│    ├── Fatigue (动态基线)     │             │  utils/              │\n'
            '│    └── Activation            │             │  storage.js          │\n'
            '│                              │             │                      │\n'
            '│  AppController (业务调度)     │             │  pages/              │\n'
            '│    ├── 校准流程管理            │             │    network/          │\n'
            '│    └── 云端命令处理            │             │    calibrate/        │\n'
            '│                              │             │    realtime/         │\n'
            '│  StorageManager              │             │    analysis/         │\n'
            '│    └── EEPROM: WiFi凭证+校准   │             └──────────────────────┘\n'
            '│                              │\n'
            '│  NetManager                  │\n'
            '│    ├── WiFi STA 连接          │\n'
            '│    ├── HTTP POST 数据上传     │\n'
            '│    ├── 云端命令轮询            │\n'
            '│    └── NTP 时间同步           │\n'
            '│                              │\n'
            '│  BleConfigServer             │\n'
            '│    └── BLE Peripheral 广播    │\n'
            '└──────────────────────────────┘\n'
            '```\n'
            '\n'
            '**数据流向：**\n'
            '- 固件每 1 秒通过 HTTP POST 将 10 帧数据上传到 `dataIngest` 云函数，存入云数据库\n'
            '- 小程序通过云函数从云数据库读取历史数据\n'
            '- 配网：小程序通过 BLE 将 WiFi 凭证发送给固件\n'
            '- 命令：云端通过 `getDeviceCommand` 云函数下发指令，固件轮询获取')

if old_arch in content:
    content = content.replace(old_arch, new_arch)
    print('Replaced architecture diagram')
else:
    print('WARNING: architecture diagram not found, searching...')
    idx = content.find('## 1. 系统架构')
    print('Found at:', idx)

f.write_text(content, encoding='utf-8')
print('Done')
