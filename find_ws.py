import pathlib
content = pathlib.Path('E:/docs/软件说明文档.md').read_text(encoding='utf-8')
idx = content.find('WebSocket')
print('Found WebSocket at index:', idx)
# 打印周围内容（ASCII safe）
surround = content[max(0,idx-200):idx+300]
safe = ''.join(c if ord(c) < 128 else '?' for c in surround)
print(safe)
