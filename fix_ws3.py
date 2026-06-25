import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 使用 raw string 精确匹配（通过逐字符找）
# 找 "小程序收到 IP → 开始 WebSocket 连接"
import re
pattern1 = r'5\. 小程序收到 IP → 开始 WebSocket 连接'
pattern2 = r'6\. 连接成功 → 进入主页'

if re.search(pattern1, content):
    content = re.sub(pattern1, '5. 配网完成 → 固件自动连接 WiFi', content)
    print('Fixed line 297')
if re.search(pattern2, content):
    content = re.sub(pattern2, '6. WiFi 连接成功 → 固件开始向云端上传数据', content)
    print('Fixed line 298')

# 找 "避免多个 socket 同时竞争固件唯一 WebSocket 连接"
pattern3 = '避免多个 socket 同时竞争固件唯一 WebSocket 连接'
if pattern3 in content:
    content = content.replace(pattern3, '避免网络请求冲突，使用队列管理重连')
    print('Fixed line 357')

# 找 "→ WebSocket 连接"
pattern4 = '\u2192 WebSocket \u8fde\u63a5'  # → WebSocket 连接
if pattern4 in content:
    content = content.replace(pattern4, '\u2192 \u4e91\u7aef\u8fde\u63a5')
    print('Fixed arrow WebSocket ref')

f.write_text(content, encoding='utf-8')
print('Done')
