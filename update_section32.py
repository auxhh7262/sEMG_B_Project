import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 替换 3.2 节（wifiClient.js 完全重写）
old_32_start = content.find('### 3.2 通信模块: wifiClient.js')
old_32_end = content.find('### 3.3 通信模块: bleClient.js')

old_32 = content[old_32_start:old_32_end]

new_32 = '''### 3.2 云端通信: 云函数调用

**架构：** 小程序不直接连接固件，而是通过微信云函数读取固件上传到云端的数据。

| 特性 | 说明 |
|------|------|
| 数据上传 | 固件通过 HTTP POST 发送到 `dataIngest` 云函数 |
| 数据读取 | 小程序调用云函数从云数据库查询 |
| 命令下发 | 小程序调用 `sendDeviceCommand` 云函数，固件轮询 `getDeviceCommand` |
| 实时性 | 固件 1 秒上传一次，小程序查询延迟约 1~3 秒 |

**相关云函数：**

| 云函数 | 功能 | 调用方 |
|--------|------|--------|
| `dataIngest` | 接收固件数据并存入云数据库 | 固件 |
| `deviceRegister` | 设备注册 | 固件 |
| `getDeviceCommand` | 拉取待执行命令 | 固件 |
| `reportDeviceStatus` | 上报设备状态 | 固件 |
| `getDeviceStatus` | 查询设备状态 | 小程序 |
| `sendDeviceCommand` | 下发命令给固件 | 小程序 |
| `ackDeviceCommand` | 确认命令已执行 | 固件 |

> **注意：** 云方案下，小程序与固件之间不再有直接的 WebSocket 连接。`wifiClient.js` 在云方案版本中已不再使用。

'''

if old_32 in content:
    content = content.replace(old_32, new_32)
    print('Replaced section 3.2')
else:
    print('WARNING: section 3.2 not found exactly')
    print('old_32_start:', old_32_start, 'old_32_end:', old_32_end)

f.write_text(content, encoding='utf-8')
print('Done')
