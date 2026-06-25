import pathlib
f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 修复 device_port 行
content = content.replace(
    '| device_port | WebSocket 端口（默认 8888） | 本地配置 |',
    '| cloud_url | 云函数 Base URL | 本地配置 |'
)

# 修复 platformio.ini 依赖
content = content.replace(
    'lib_deps = WebSockets, ArduinoBLE, EEPROM, ArduinoJson',
    'lib_deps = ArduinoBLE, EEPROM, ArduinoJson'
)

f.write_text(content, encoding='utf-8')
print('Done')
