import pathlib
content = pathlib.Path('E:/docs/软件说明文档.md').read_text(encoding='utf-8')
# 找所有含 WebSocket 的行（不作为 "已移除 WebSocket" 的一部分）
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'WebSocket' in line and '已移除' not in line and '移除' not in line:
        print(f'Line {i+1}: {line[:100]}')
