import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 1. 第66行附近：setup执行顺序
content = content.replace(
    '8. gNetManager.init()          \u2190 WiFi\u8fde\u63a5 + WebSocket Server(:8888)',
    '8. gNetManager.init()          \u2190 WiFi\u8fde\u63a5 + NTP\u540c\u6b65 + \u4e91\u7aef\u4e0a\u4f20\u542f\u52a8'
)

# 2. 第84行附近：tick执行顺序
content = content.replace(
    'gNetManager.tick()           \u2190 WebSocket loop + WiFi \u72b6\u6001\u7ba1\u7406',
    'gNetManager.tick()           \u2190 HTTP\u4e0a\u4f20 + \u4e91\u7aef\u547d\u4ee4\u8f6e\u8be2 + WiFi \u72b6\u6001\u7ba1\u7406'
)

# 3. 小程序配网流程说明（第297行附近）
old_net = ('5. 小程序收到 IP → 开始 WebSocket 连接\n'
           '6. 连接成功 → 进入主页')
new_net = ('5. 配网完成 → 固件自动连接 WiFi\n'
           '6. WiFi 连接成功 → 固件开始向云端上传数据')
content = content.replace(old_net, new_net)

# 4. wifiClient.js 里的 WebSocket 引用（第375行附近）
content = content.replace(
    '**WebSocket 客户端（V10.4）：**',
    '**云端通信（HTTP 上传方案）：**'
)

# 5. wifiClient.js API 表中的 WebSocket 连接
# 这个较复杂，先只改标题

f.write_text(content, encoding='utf-8')
print('Done - partial fix')
print('Remaining WebSocket lines (excluding removed/cloud references):')
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'WebSocket' in line and '已移除' not in line and '不再使用' not in line and '移除' not in line:
        print(f'  Line {i+1}: {line.strip()[:80]}')
