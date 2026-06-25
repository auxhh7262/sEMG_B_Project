import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

start = content.find('### 3.2 通信模块: wifiClient.js')
end = content.find('### 3.3 通信模块: bleClient.js')

old_32 = content[start:end]

new_32 = ('### 3.2 云端通信: 云函数调用\n'
          '\n'
          '**架构：** 小程序不直接连接固件，而是通过微信云函数读取固件上传到云端的数据。\n'
          '\n'
          '| 特性 | 说明 |\n'
          '|------|------|\n'
          '| 数据上传 | 固件通过 HTTP POST 发送到 `dataIngest` 云函数 |\n'
          '| 数据读取 | 小程序调用云函数从云数据库查询 |\n'
          '| 命令下发 | 小程序调用 `sendDeviceCommand` 云函数，固件轮询 `getDeviceCommand` |\n'
          '| 实时性 | 固件 1 秒上传一次，小程序查询延迟约 1~3 秒 |\n'
          '\n'
          '**相关云函数：**\n'
          '\n'
          '| 云函数 | 功能 | 调用方 |\n'
          '|--------|------|--------|\n'
          '| `dataIngest` | 接收固件数据并存入云数据库 | 固件 |\n'
          '| `deviceRegister` | 设备注册 | 固件 |\n'
          '| `getDeviceCommand` | 拉取待执行命令 | 固件 |\n'
          '| `reportDeviceStatus` | 上报设备状态 | 固件 |\n'
          '| `getDeviceStatus` | 查询设备状态 | 小程序 |\n'
          '| `sendDeviceCommand` | 下发命令给固件 | 小程序 |\n'
          '| `ackDeviceCommand` | 确认命令已执行 | 固件 |\n'
          '\n'
          '> **注意：** 云方案下，小程序与固件之间不再有直接的 WebSocket 连接。`wifiClient.js` 在云方案版本中已不再使用。\n'
          '\n'
          '### 3.3 通信模块: bleClient.js\n'
          '  '  # 注意：这里包含了 "### 3.3" 开头，下面会处理

)

# 新文本里已经包含了 "### 3.3" 开头，所以 end 应该指向 ### 3.3 那一行
# 但我们的 new_32 结尾是 "### 3.3 通信模块: bleClient.js\n  "
# 需要把原来的 end 行保留
# 更安全的做法：只替换 ### 3.2 到 ### 3.3 之前的内容

# 重新计算：找到 ### 3.3 行的开头
lines = content.split('\n')
in_32 = False
before = []
section_32 = []
after = []
for line in lines:
    if line.startswith('### 3.2'):
        in_32 = True
        section_32.append(line)
    elif line.startswith('### 3.3'):
        in_32 = False
        after.append(line)
    elif in_32:
        section_32.append(line)
    else:
        before.append(line)

print('Before lines:', len(before))
print('Section 3.2 lines:', len(section_32))
print('After lines:', len(after))
print('Section 3.2 start:', section_32[0][:50])
print('After start:', after[0][:50])
