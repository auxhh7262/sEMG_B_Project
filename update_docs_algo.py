import pathlib

f = pathlib.Path('E:/docs/算法说明文档.md')
content = f.read_text(encoding='utf-8')

# 更新第10节
old_s10 = ('## 10. 数值精度与传输规则\n'
           '\n'
           '> 云方案版本 v3.0 — 通过 HTTP JSON 上传到云端\n'
           '\n'
           '| 参数 | 物理单位 | 逻辑精度 | 传输格式 | JSON 字段名 | 示例 |\n'
           '|------|---------|---------|---------|------------|------|\n'
           '| RMS | mV | 3 位小数 | int32 ×1000 | `rms` | 0.852 mV → 852 |\n'
           '| MDF | Hz | 1 位小数 | uint16 ×10 | `mdf` | 84.9 Hz → 849 |\n'
           '| Activation | % | 1 位小数 | uint16 ×10 | `activation` | 80.0% → 800 |\n'
           '| Fatigue | % | 1 位小数 | uint16 ×10 | `fatigue` | 22.3% → 223 |\n'
           '| Quality | — | 整数 | uint8 | `quality` | 85 → 85 |\n'
           '\n'
           '**单帧 JSON 最大约 71 字节**（RMS 最大 7 位数字）\n'
           '\n'
           '**批量上传：** 每 30 帧 / 3 秒上传一次，请求体约 2.2 KB |\n'
           '\n'
           '---\n'
           '\n'
           '_文档生成: 2026-06-23 | 来源：firmware/src/1_Signal/SignalProcessor.cpp 实际代码 100% 对齐_')

new_s10 = ('## 10. 数值精度与传输规则\n'
           '\n'
           '> 云方案版本 v3.1 — 通过 HTTP POST 上传到 `dataIngest` 云函数\n'
           '\n'
           '| 参数 | 物理单位 | 逻辑精度 | 传输格式 | 示例 |\n'
           '|------|---------|---------|---------|------|\n'
           '| RMS | mV | 3 位小数 | int32 ×1000 | 0.852 mV → 852 |\n'
           '| MDF | Hz | 1 位小数 | uint16 ×10 | 84.9 Hz → 849 |\n'
           '| Activation | % | 1 位小数 | uint16 ×10 | 80.0% → 800 |\n'
           '| Fatigue | % | 1 位小数 | uint16 ×10 | 22.3% → 223 |\n'
           '| Quality | — | 整数 | uint8 | 85 → 85 |\n'
           '\n'
           '**上传格式：** 只传 `points` 字段，字段顺序固定 `[rms×1000, activation×10, mdf×10, fatigue×10, quality]`\n'
           '\n'
           '**批次大小：** 10 帧/批（1秒 @ 10Hz），或缓冲区满立即上传\n'
           '\n'
           '**单批请求体大小：** ~300 字节（10帧）\n'
           '\n'
           '**流量估算：** ~1.1KB/s ≈ 4MB/小时（含 HTTP 请求头）\n'
           '\n'
           '---\n'
           '\n'
           '_文档更新: 2026-06-25 | 来源：firmware/src/1_Signal/SignalProcessor.cpp 实际代码 100% 对齐_')

if old_s10 in content:
    content = content.replace(old_s10, new_s10)
    print('Replaced section 10')
else:
    print('WARNING: section 10 not found, trying to find it...')
    idx = content.find('## 10. 数值精度与传输规则')
    print(repr(content[idx:idx+500]))

# 更新文档顶部版本号
content = content.replace(
    '> 版本：v2.0 | 更新：2026-06-25 | 云方案版本 — 基于固件 SignalProcessor v1.0 实际代码 100% 对齐',
    '> 版本：v2.1 | 更新：2026-06-25 | 云方案版本 v3.1 — 基于固件 SignalProcessor 实际代码 100% 对齐'
)

f.write_text(content, encoding='utf-8')
print('Done! File length:', len(content))
