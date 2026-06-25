import pathlib

for name in ['软件说明文档.md', '算法说明文档.md']:
    f = pathlib.Path('E:/docs/' + name)
    content = f.read_text(encoding='utf-8')
    print('=== ' + name + ' (' + str(f.stat().st_size) + ' bytes) ===')
    print('  version: ' + ('v3.1' if 'v3.1' in content else 'v2.1' if 'v2.1' in content else 'NOT FOUND'))
    print('  has INGEST_BATCH_FRAMES: ' + str('INGEST_BATCH_FRAMES' in content))
    print('  has WebSocket ref: ' + str('WebSocket Server' in content or 'WebSocket(8888)' in content))
    print('  has HTTP POST / cloud ref: ' + str('HTTP POST' in content or '云函数' in content))
    print('  has points format: ' + str('points' in content))
    print()
