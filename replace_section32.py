import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

lines = content.split('\n')
result = []
in_32 = False
skip_rest_of_32 = False

i = 0
while i < len(lines):
    line = lines[i]
    if line.startswith('### 3.2'):
        # 开始替换 3.2 节
        result.append('### 3.2 云端通信: 云函数调用')
        result.append('')
        result.append('**架构：** 小程序不直接连接固件，而是通过微信云函数读取固件上传到云端的数据。')
        result.append('')
        result.append('| 特性 | 说明 |')
        result.append('|------|------|')
        result.append('| 数据上传 | 固件通过 HTTP POST 发送到 `dataIngest` 云函数 |')
        result.append('| 数据读取 | 小程序调用云函数从云数据库查询 |')
        result.append('| 命令下发 | 小程序调用 `sendDeviceCommand` 云函数，固件轮询 `getDeviceCommand` |')
        result.append('| 实时性 | 固件 1 秒上传一次，小程序查询延迟约 1~3 秒 |')
        result.append('')
        result.append('**相关云函数：**')
        result.append('')
        result.append('| 云函数 | 功能 | 调用方 |')
        result.append('|--------|------|--------|')
        result.append('| `dataIngest` | 接收固件数据并存入云数据库 | 固件 |')
        result.append('| `deviceRegister` | 设备注册 | 固件 |')
        result.append('| `getDeviceCommand` | 拉取待执行命令 | 固件 |')
        result.append('| `reportDeviceStatus` | 上报设备状态 | 固件 |')
        result.append('| `getDeviceStatus` | 查询设备状态 | 小程序 |')
        result.append('| `sendDeviceCommand` | 下发命令给固件 | 小程序 |')
        result.append('| `ackDeviceCommand` | 确认命令已执行 | 固件 |')
        result.append('')
        result.append('> **注意：** 云方案下，小程序与固件之间不再有直接的 WebSocket 连接。`wifiClient.js` 在云方案版本中已不再使用。')
        result.append('')
        # 跳过旧 3.2 节的所有行，直到遇到 ### 3.3
        in_32 = True
        i += 1
        continue
    if in_32 and line.startswith('### 3.3'):
        # 恢复写入，从 ### 3.3 开始
        in_32 = False
        result.append(line)
        i += 1
        continue
    if in_32:
        # 跳过旧 3.2 节内容
        i += 1
        continue
    result.append(line)
    i += 1

new_content = '\n'.join(result)
f.write_text(new_content, encoding='utf-8')
print('Done! New file size:', len(new_content))
print('Section 3.2 replaced successfully')
