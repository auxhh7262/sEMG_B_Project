import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 替换 setup() 执行顺序中的 "WebSocket Server(:8888)"
content = content.replace(
    'gNetManager.init()           → WiFi连接 + WebSocket Server(:8888)',
    'gNetManager.init()           → WiFi连接 + NTP同步 + 云端上传启动'
)

# 替换 tick() 说明中的 "WebSocket loop"
content = content.replace(
    'gNetManager.tick()           → WebSocket loop + WiFi 状态维持',
    'gNetManager.tick()           → HTTP上传 + 云端命令轮询 + WiFi 状态维持'
)

f.write_text(content, encoding='utf-8')
print('Done')
