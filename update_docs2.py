import pathlib

f = pathlib.Path('E:/docs/软件说明文档.md')
content = f.read_text(encoding='utf-8')

# 替换 5.3 节
old_53 = ('### 5.3 实时帧 {type: "data"} (v3.9.27 统一格式)\n\n'
          '```json\n'
          '{\n'
          '  "type": "data",\n'
          '  "ts": 1750123456789,        // NTP毫秒时间戳\n'
          '  "rms": 82.520,              // mV, 3位小数\n'
          '  "activation": 80.0,         // %, 1位小数\n'
          '  "mdf": 84.9,                // Hz, 1位小数\n'
          '  "fatigue": 22.3,            // %, 1位小数\n'
          '  "quality": 85               // 0~100\n'
          '}\n'
          '```\n')

new_53 = ('### 5.3 云端上传数据帧 (v3.9.45 简化格式)\n'
          '\n'
          '固件每 1 秒通过 HTTP POST 上传一批数据到 `dataIngest` 云函数，请求体格式：\n'
          '\n'
          '```json\n'
          '{\n'
          '  "points": [\n'
          '    [852, 800, 849, 223, 85],\n'
          '    [860, 810, 845, 225, 86],\n'
          '    ...\n'
          '  ]\n'
          '}\n'
          '```\n'
          '\n'
          '字段顺序固定：`[rms×1000, activation×10, mdf×10, fatigue×10, quality]`\n'
          '\n'
          '| 字段 | 说明 | 示例 |\n'
          '|------|------|------|\n'
          '| rms×1000 | mV，3位小数 | 0.852mV → 852 |\n'
          '| activation×10 | %，1位小数 | 80.0% → 800 |\n'
          '| mdf×10 | Hz，1位小数 | 84.9Hz → 849 |\n'
          '| fatigue×10 | %，1位小数 | 22.3% → 223 |\n'
          '| quality | 0~100 整数 | 85 |\n'
          '\n'
          '**上传频率：** 1秒/次（10帧/批），或缓冲区满立即上传。\n')

if old_53 in content:
    content = content.replace(old_53, new_53)
    print('Replaced section 5.3')
else:
    print('WARNING: section 5.3 not found')

# 替换常量表中的 WEBSOCKET_PORT 行
old_const = '| WEBSOCKET_PORT | 8888 | wifiClient.js |'
new_const = '| INGEST_BATCH_FRAMES | 10 | NetManager.h |\n| INGEST_RETRY_QUEUE | 150 | NetManager.h |'
if old_const in content:
    content = content.replace(old_const, new_const)
    print('Replaced constants table')
else:
    print('WARNING: constants table row not found')

f.write_text(content, encoding='utf-8')
print('Done! File length:', len(content))
