import pathlib
content = pathlib.Path('E:/docs/软件说明文档.md').read_text(encoding='utf-8')
idx = 0
while True:
    idx = content.find('WebSocket', idx)
    if idx == -1:
        break
    surround = content[max(0,idx-50):idx+100]
    print('Found at', idx, ':')
    print(repr(surround))
    print('---')
    idx += 1
