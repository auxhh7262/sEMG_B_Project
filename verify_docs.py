import pathlib

for name in ['软件说明文档.md', '算法说明文档.md']:
    f = pathlib.Path('E:/docs/' + name)
    content = f.read_text(encoding='utf-8')
    print('=== ' + name + ' (' + str(f.stat().st_size) + ' bytes) ===')
    has_v31 = 'v3.1' in content
    has_v21 = 'v2.1' in content
    print('  version: ' + ('v3.1' if has_v31 else ('v2.1' if has_v21 else 'NOT FOUND')))
    print('  has INGEST_BATCH_FRAMES: ' + str('INGEST_BATCH_FRAMES' in content))
    print('  still has WebSocket Server: ' + str('WebSocket Server' in content))
    # 检查 points 格式
    has_points = '"points"' in content or 'points' in content
    print('  has points format: ' + str(has_points))
    print()
