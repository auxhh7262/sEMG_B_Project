import pathlib
content = pathlib.Path('E:/docs/软件说明文档.md').read_text(encoding='utf-8')
lines = content.split('\n')
print('Total lines:', len(lines))
print('File size:', len(content), 'bytes')
print()

# 检查残留 WebSocket 引用
ws_lines = []
for i, line in enumerate(lines):
    if 'WebSocket' in line and '已移除' not in line and '不再使用' not in line:
        ws_lines.append((i+1, line.strip()))

if ws_lines:
    print('Remaining WebSocket references:')
    for ln, text in ws_lines:
        print(f'  Line {ln}: {text[:80]}')
else:
    print('No remaining WebSocket references (except "已移除"/"不再使用")')

print()
# 检查版本号
if 'v3.1' in content:
    print('Version: v3.1 OK')
if 'INGEST_BATCH_FRAMES' in content:
    print('INGEST_BATCH_FRAMES: present')
if 'points' in content:
    print('points format: present')
