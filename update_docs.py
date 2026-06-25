import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 1. 更新版本号（已完成，保险起见再执行一次）
content = content.replace(
    '版本：v3.0 | 更新：2026-06-24 | 云方案版本（已移除 SPI Flash / A-B-C 分区）',
    '版本：v3.1 | 更新：2026-06-25 | 云方案版本（HTTP 上传，已移除 WebSocket / A-B-C 分区）'
)

# 2. 替换 2.5 节 NetManager
old_25 = content[content.index('### 2.5 网络通信: NetManager'):]
old_25 = old_25[:old_25.index('\n### 2.6')]

new_25 = '''### 2.5 网络通信: NetManager（云端 HTTP 上传方案）

**架构：** 固件通过 HTTP POST 将数据上传到微信云开发云函数，不再使用 WebSocket 直连小程序。

```
固件 ──HTTP POST──► 微信云函数(dataIngest) ──► 云数据库
小程序 ──云函数调用──► 云数据库 ← 读取固件上传的数据
```

**上传格式（v3.9.45 简化后）：**

```json
{
  "points": [
    [852, 800, 849, 223, 85],
    [860, 810, 845, 225, 86],
    ...
  ]
}
```

字段顺序固定：`[rms×1000, activation×10, mdf×10, fatigue×10, quality]`，不需要传 `session_id`、`device_id`、`fields`。

**上传参数（v3.9.45）：**

| 常量 | 值 | 说明 |
|------|-----|----------|
| `INGEST_BATCH_FRAMES` | 10 | 每批上传帧数（1秒 @ 10Hz） |
| `INGEST_RETRY_QUEUE` | 150 | 断网重试队列最大帧数（15秒缓存） |
| 上传频率 | 1秒/次（或缓冲区满） | 实时性约 1 秒延迟 |

**上传触发条件：**
- 时间触发：距上次上传 ≥ 1秒
- 缓冲区满：`_batchCount >= INGEST_BATCH_FRAMES`（10帧）

**断网重试机制：**
- `pushDataPoint()` 先将数据存入 `_retryQueue`（150帧环形缓冲）
- 网络恢复后，下次成功上传时会将重试队列中的数据补传到云端
- 队列满时覆盖最旧数据（环形覆盖）

**云端通信链路：**

| 功能 | 云函数 | HTTP 路径 |
|------|--------|----------|
| 设备注册 | `deviceRegister` | `/deviceRegister` |
| 数据上传 | `dataIngest` | `/dataIngest` |
| 命令拉取 | `getDeviceCommand` | `/getDeviceCommand` |
| 状态上报 | `reportDeviceStatus` | `/reportDeviceStatus` |
| 命令确认 | `ackDeviceCommand` | `/ackDeviceCommand` |

**HTTP 实现：**
- 使用 `WiFiClient` + `client.print()` 手动构造 HTTP POST 请求
- 目标：绕过 UNO R4 WiFi 的 HTTPS 兼容性问题（改用 HTTP）
- 云端 Base URL：`http://cloud1-d4gqmimmo05b12c94-1446329561.ap-shanghai.app.tcloudbase.com`

**NTP 时间同步：**
- 固件不再上传 `ts` 字段，云端使用服务器时间存储
- NTP 同步仅用于固件本地日志时间戳
'''

content = content.replace(old_25, new_25)

# 3. 替换 5.3 节（实时帧格式）
old_53 = '''### 5.3 实时帧 {type: "data"} (v3.9.27 统一格式)

```json
{
  "type": "data",
  "ts": 1750123456789,
  "rms": 82.520,
  "activation": 80.0,
  "mdf": 84.9,
  "fatigue": 22.3,
  "quality": 85
}
```'''

new_53 = '''### 5.3 云端上传数据帧 (v3.9.45 简化格式)

```json
{
  "points": [
    [852, 800, 849, 223, 85],
    [860, 810, 845, 225, 86],
    ...
  ]
}
```

字段顺序固定：`[rms×1000, activation×10, mdf×10, fatigue×10, quality]`

| 字段 | 说明 | 示例 |
|------|------|------|
| rms×1000 | mV，3位小数 | 0.852mV → 852 |
| activation×10 | %，1位小数 | 80.0% → 800 |
| mdf×10 | Hz，1位小数 | 84.9Hz → 849 |
| fatigue×10 | %，1位小数 | 22.3% → 223 |
| quality | 0~100 整数 | 85 |

**上传频率：** 1秒/次（10帧/批），或缓冲区满立即上传。'''

if old_53 in content:
    content = content.replace(old_53, new_53)
    print('Replaced section 5.3')
else:
    print('WARNING: section 5.3 not found, skipping')

# 4. 更新常量表（去掉 WEBSOCKET_PORT，加上 INGEST_*）
old_const = '| WEBSOCKET_PORT | 8888 | wifiClient.js |'
new_const = '| INGEST_BATCH_FRAMES | 10 | NetManager.h |\n| INGEST_RETRY_QUEUE | 150 | NetManager.h |'
content = content.replace(old_const, new_const)

# 5. 更新文档末尾的更新说明
content = content.replace(
    '_文档更新: 2026-06-24 | 版本: 云方案 v3.0（已移除 SPI Flash / A-B-C 分区） | 来源：firmware/src/ + mini_program/ 实际代码 100% 对齐_',
    '_文档更新: 2026-06-25 | 版本: 云方案 v3.1（HTTP 上传，10帧/批，15秒重试缓存） | 来源：firmware/src/ + mini_program/ 实际代码 100% 对齐_'
)

f.write_text(content, encoding='utf-8')
print('Done! File length:', len(content))
