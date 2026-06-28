#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 sEMG 算法说明文档（纯 Python，无第三方依赖）
直接用 zipfile 生成 .docx（.docx 本质是 zip 包）
"""
import zipfile
import os
import textwrap

OUT_PATH = r"E:\sEMG_B_Project\docs\sEMG_算法说明文档.docx"

# ========== 文档 XML 模板 ==========
# 由于完整 OOXML 非常冗长，这里生成一个最小可用文档
# 包含：封面、目录、各章节、公式（用文字描述）、表格

# --- content_types.xml ---
CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/_rels/.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>'''

# --- _rels/.rels ---
RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

# --- word/_rels/document.xml.rels ---
DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

# --- word/settings.xml ---
SETTINGS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>'''

# --- word/fontTable.xml ---
FONT_TABLE = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Arial">
    <w:panose1 w:val="020B0604020202020204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
    <w:sig w:usb0="A00002EF" w:usb1="40000000" w:usb2="00000000" w:usb3="00000000"
           w:csb0="0000009F" w:csb1="00000000"/>
  </w:font>
</w:fonts>'''

# --- word/styles.xml（简化版，只定义基本样式）---
STYLES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="宋体"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="zh-CN" w:eastAsia="zh-CN"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="宋体"/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr><w:pbdr w:val="single" w:sz="4" w:color="1F3864" w:space="1"/>
      <w:spacing w:before="480" w:after="240"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:sz w:val="32"/><w:color w:val="1F3864"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="360" w:after="180"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:sz w:val="28"/><w:color w:val="2E5A9C"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:uiPriority w:val="9"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:sz w:val="24"/><w:color w:val="1A6FB8"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="Caption"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
  </w:style>
</w:styles>'''

# ========== 辅助函数：构建 document.xml 正文 ==========

def esc(s):
    """XML 转义"""
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def p(text, style="Normal", bold=False, color=None, sz=None):
    """段落 XML"""
    r_props = ""
    if bold:
        r_props += "<w:b/>"
    if color:
        r_props += f'<w:color w:val="{color}"/>'
    if sz:
        r_props += f'<w:sz w:val="{sz}"/>'
    r_props += '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>'
    r_inner = f"<w:r>{r_props}<w:t xml:space='preserve'>{esc(text)}</w:t></w:r>"
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{r_inner}</w:p>'

def p_runs(runs, style="Normal"):
    """多 run 段落"""
    rs = ""
    for run in runs:
        text, props = run
        r_props = "<w:rFonts w:ascii='Arial' w:hAnsi='Arial'/>"
        if props.get("bold"):
            r_props += "<w:b/>"
        if props.get("color"):
            r_props += f"<w:color w:val='{props['color']}'/>"
        if props.get("sz"):
            r_props += f"<w:sz w:val='{props['sz']}'/>"
        if props.get("italic"):
            r_props += "<w:i/>"
        rs += f"<w:r>{r_props}<w:t xml:space='preserve'>{esc(text)}</w:t></w:r>"
    return f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>{rs}</w:p>'

def empty_para():
    return '<w:p><w:r><w:t/></w:r></w:p>'

def page_break():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

def formula_line(formula, explanation=""):
    """公式行（用特殊格式显示）"""
    lines = []
    lines.append(
        f'<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F0F8FF"/>'
        f'<w:ind w:left="720"/></w:pPr>'
        f'<w:r><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'
        f'<w:b/><w:color w:val="1A6FB8"/><w:sz w:val="22"/>'
        f'<w:t xml:space="preserve">{esc(formula)}</w:t></w:r></w:p>'
    )
    if explanation:
        lines.append(
            f'<w:p><w:pPr><w:ind w:left="720"/></w:pPr>'
            f'<w:r><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:color w:val="555555"/>'
            f'<w:t xml:space="preserve">{esc(explanation)}</w:t></w:r></w:p>'
        )
    return "\n".join(lines)

def bullet_para(text, level=0):
    """列表项目"""
    indent = (level + 1) * 360
    return (
        f'<w:p><w:pPr><w:ind w:left="{720 + level * 360}" w:hanging="360"/>'
        f'<w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="1"/></w:pPr>'
        f'<w:r><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/>'
        f'<w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'
    )

def table_xml(headers, rows, col_widths_dxa=None):
    """生成表格 XML（简化，使用基本表格结构）"""
    # 由于完整 OOXML 表格非常冗长，这里用文字描述表格内容
    # 实际生成时，我们改用段落 + 制表符模拟表格
    # 但更好的方式是直接生成真正的表格
    # 由于篇幅，这里简化为文字描述，完整版建议用 pandoc 或 python-docx
    pass

# ========== 由于直接生成 OOXML 表格非常复杂，改用另一种方案 ==========
# 改用 pandoc 从 Markdown 转 .docx（如果可用），或直接生成 PDF
# 但最可靠的是：生成 Markdown，然后用系统上的 pandoc 转 docx

# ===== 重新设计：生成 Markdown，然后用 pandoc 转 docx =====
# 先检查 pandoc 是否可用

def check_pandoc():
    import subprocess
    try:
        r = subprocess.run(["pandoc", "--version"], capture_output=True, text=True, timeout=5)
        return r.returncode == 0
    except:
        return False

def build_markdown():
    """生成完整的 Markdown 文档内容"""
    md = []
    md.append("% sEMG 肌电信号疲劳检测算法说明")
    md.append("% 基于 Arduino UNO R4 WiFi 的便携式肌肉疲劳监测设备")
    md.append("% 2026年6月")
    md.append("")
    md.append("\\newpage")
    md.append("")
    md.append("# 目录")
    md.append("")
    md.append("1. [项目背景与意义](#1-项目背景与意义)")
    md.append("2. [算法整体架构](#2-算法整体架构)")
    md.append("3. [核心算法详解](#3-核心算法详解)")
    md.append("   - 3.1 [信号采集与预处理](#31-信号采集与预处理)")
    md.append("   - 3.2 [RMS计算](#32-rms计算)")
    md.append("   - 3.3 [MDF计算](#33-mdf计算)")
    md.append("   - 3.4 [激活度计算](#34-激活度计算)")
    md.append("   - 3.5 [疲劳度计算](#35-疲劳度计算)")
    md.append("   - 3.6 [信号质量评估](#36-信号质量评估)")
    md.append("4. [创新亮点](#4-创新亮点)")
    md.append("5. [优点与缺点分析](#5-优点与缺点分析)")
    md.append("6. [算法参数说明](#6-算法参数说明)")
    md.append("7. [参考文献](#7-参考文献)")
    md.append("")
    md.append("\\newpage")
    md.append("")

    # ===== 1. 项目背景 =====
    md.append("# 1. 项目背景与意义")
    md.append("")
    md.append("肌肉疲劳的实时监测在运动科学、康复医学和人机交互中具有重要意义。表面肌电信号（sEMG）是一种通过皮肤表面电极采集肌肉电活动的非侵入式技术，已广泛应用于肌肉状态评估。")
    md.append("")
    md.append("传统 sEMG 疲劳检测设备通常依赖昂贵的专用仪器和计算机端软件，不便携且成本高。本项目基于 Arduino UNO R4 WiFi 开发了一款便携式 sEMG 疲劳监测设备，具有以下特点：")
    md.append("")
    md.append("- **低成本**：BOM 成本约 200 元人民币（AD8232 传感器 + UNO R4 WiFi + 电平转换）")
    md.append("- **便携**：腕带式设计，可实时在手机微信小程序上查看数据")
    md.append("- **云端**：数据通过 WiFi 上传至微信云开发平台，支持历史分析")
    md.append("- **自主算法**：固件端实现完整的 RMS、MDF、激活度、疲劳度计算，无需计算机端处理")
    md.append("")
    md.append("本算法说明文档面向高中生科创项目评审，重点阐述核心算法的原理、创新亮点及优缺点。")
    md.append("")

    # ===== 2. 算法整体架构 =====
    md.append("# 2. 算法整体架构")
    md.append("")
    md.append("算法运行在 Arduino UNO R4 WiFi（瑞萨 RA4M1 芯片，主频 48MHz，RAM 32KB）上，采用定时器中断驱动采样，在主循环中完成全部信号处理。")
    md.append("")
    md.append("**处理流程（8 步）**")
    md.append("")
    md.append("| 步骤 | 处理内容 | 输出 |")
    md.append("|------|---------|------|")
    md.append("| 1 | ADC 中断采样（1000Hz） | 原始 sEMG 电压信号 |")
    md.append("| 2 | 环形缓冲区管理（512 点） | 滑动数据窗口 |")
    md.append("| 3 | RMS 计算（256 点窗口） | 肌肉激活强度（mV） |")
    md.append("| 4 | FFT + 功率谱（256 点） | 频谱分布 |")
    md.append("| 5 | MDF 计算（中值频率） | 频谱中心位置（Hz） |")
    md.append("| 6 | 激活度归一化 | 0～100% |")
    md.append("| 7 | 疲劳度计算（MDF 下降率） | 0～100% |")
    md.append("| 8 | 信号质量评估 | 0～100 分 |")
    md.append("")
    md.append("> **关键设计决策**：由于 RA4M1 的 RAM 仅 32KB，FFT 使用 256 点（而非 512 点），以减少内存占用。频谱计算采用自实现定点 FFT（库仑复数旋转因子预计算），避免依赖大型 FFT 库。")
    md.append("")

    # ===== 3. 核心算法详解 =====
    md.append("# 3. 核心算法详解")
    md.append("")

    md.append("## 3.1 信号采集与预处理")
    md.append("")
    md.append("AD8232 传感器输出经 BSS138 电平转换（3.3V ↔ 5V）后，接入 UNO R4 WiFi 的 14 位 ADC（量程 0～3.3V）。采样由硬件定时器中断驱动，固定 **1000Hz**：")
    md.append("")
    md.append("```cpp")
    md.append("// main.cpp — ADC 定时器配置")
    md.append("ADC::adc_timer.begin([]() {")
    md.append("  int16_t adcVal = analogRead(ADC_PIN);")
    md.append("  gSignalProcessor.isrPushSample(adcVal);")
    md.append("}, 1000.0f);  // 1000 Hz")
    md.append("```")
    md.append("")
    md.append("**环形缓冲区设计**：使用 512 点的环形缓冲区（`RING_BUFFER_SIZE = 512`），写指针由中断上下文更新，读指针由主循环更新。采用 `volatile` 变量保护，避免中断与主循环之间的数据竞争。")
    md.append("")
    md.append("**DC 偏移去除**：sEMG 信号含有电极与皮肤接触产生的 DC 偏移，计算 RMS 前需去除。采用窗口内简单均值法（而非去极值均值），因为 256 点已足够稳定，且去极值会破坏时序：")
    md.append("")
    md.append("$$")
    md.append(r"DC_{bias} = \frac{1}{N} \sum_{i=0}^{N-1} x[i]")
    md.append("$$")
    md.append("")
    md.append("其中 $N = 256$（FFT 窗口大小），$x[i]$ 为 ADC 原始采样值（单位：mV）。")
    md.append("")

    md.append("## 3.2 RMS（均方根）计算")
    md.append("")
    md.append("RMS 反映肌肉收缩时的信号总功率，与收缩强度正相关，是激活度归一化的基础。")
    md.append("")
    md.append("$$")
    md.append(r"RMS = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} (x[i] - DC_{bias})^2}")
    md.append("$$")
    md.append("")
    md.append("- $N = 256$，对应 256 ms 时间窗口（@1000Hz 采样）")
    md.append("- $x[i]$ 为去除 DC 偏移后的交流分量（单位：mV）")
    md.append("- RMS 计算使用加窗**前**的原始信号，因为 RMS 反映时域能量，加窗会影响幅值准确性")
    md.append("")

    md.append("## 3.3 MDF（中值频率）计算")
    md.append("")
    md.append("MDF（Median Frequency，中值频率）是肌电信号频谱的中心位置，肌肉疲劳时 MDF 会系统性下降。这是本算法的核心疲劳指标，大量文献已验证其可靠性。")
    md.append("")
    md.append("**FFT 实现**：使用 256 点实数 FFT（自实现，旋转因子预计算），加 Hamming 窗减少频谱泄露：")
    md.append("")
    md.append("```")
    md.append("w[i] = 0.5 × (1 - cos(2πi / (N-1)))  // Hamming 窗")
    md.append("x_windowed[i] = (x[i] - DC_bias) × w[i]")
    md.append("```")
    md.append("")
    md.append("**MDF 定义**：MDF 是使下式成立的频率 $f_{mdf}$：")
    md.append("")
    md.append("$$")
    md.append(r"\int_{f_{min}}^{f_{mdf}} P(f) df = \int_{f_{mdf}}^{f_{max}} P(f) df = \frac{1}{2} \int_{f_{min}}^{f_{max}} P(f) df")
    md.append("$$")
    md.append("")
    md.append("- $P(f)$ 为功率谱密度")
    md.append("- $f_{min} = 10\\ Hz$，$f_{max} = 250\\ Hz$（肌电信号有效频谱范围）")
    md.append("")
    md.append("**MDF 计算步骤**：")
    md.append("")
    md.append("1. 计算功率谱：$P[k] = (Re[k]^2 + Im[k]^2) / N$，$k = 0 \\sim N/2-1$")
    md.append("2. 计算总功率：$P_{total} = \\sum P[k]$（k 对应 10～250 Hz）")
    md.append("3. 若 $P_{total} < 10^{-12}$，视为信号太弱，返回 -1（跳过本次）")
    md.append("4. 累积功率，找到使累积功率 $\\ge 0.5 \\times P_{total}$ 的 bin")
    md.append("5. 线性插值获得精确 MDF 值")
    md.append("")
    md.append("**EMA 平滑**：原始 MDF 值逐帧波动较大，采用指数移动平均（EMA）平滑：")
    md.append("")
    md.append("$$")
    md.append(r"MDF_{current} = MDF_{last} \\times (1 - \\alpha) + MDF_{raw} \\times \\alpha")
    md.append("$$")
    md.append("")
    md.append("| 信号状态 | $\\alpha$ 值 | 设计理由 |")
    md.append("|---------|----------|---------|")
    md.append("| 收缩期 / MDF 下降 | 0.35 | 快速跟踪频谱变化，避免滞后 |")
    md.append("| 稳态期（>10 帧） | 0.15 | 抑制逐帧抖动，输出平滑 |")
    md.append("| 启动过渡（<10 帧） | 0.5→0.15 线性过渡 | 避免初始值偏差导致长时间收敛 |")
    md.append("")

    md.append("## 3.4 激活度（Activation）计算")
    md.append("")
    md.append("激活度将实时 RMS 归一化到 0～100%，直观反映肌肉收缩强度。")
    md.append("")
    md.append("$$")
    md.append(r"A(\\%) = \\text{clamp}\\left( \\frac{RMS_{current} - RMS_{relax}}{RMS_{active} - RMS_{relax}} \\times 100\\%,  0, 100 \\right)")
    md.append("$$")
    md.append("")
    md.append("- $RMS_{relax}$：校准得到的放松状态 RMS（10 秒静息均值）")
    md.append("- $RMS_{active}$：校准得到的主动收缩 RMS（15 秒最大收缩峰值）")
    md.append("- **物理意义**：$A = 0\\%$ 表示完全放松，$A = 100\\%$ 表示达到了校准时的最大收缩强度")
    md.append("")

    md.append("## 3.5 疲劳度（Fatigue）计算")
    md.append("")
    md.append("疲劳度是本算法的核心输出，基于 MDF 下降幅度计算，归一化到 0～100%。")
    md.append("")
    md.append("**公式**：")
    md.append("")
    md.append("$$")
    md.append(r"F_{raw}(\\%) = \\text{clamp}\\left( \\frac{MDF_{baseline} - MDF_{current}}{MDF_{baseline}} \\times 100\\%,  0, 100 \\right)")
    md.append("$$")
    md.append("")
    md.append("- $MDF_{baseline}$：**动态基线**，取本次收缩开始时的 MDF 值（A 从 <20% 跨越到 >20% 时捕获）")
    md.append("- 若无可用的动态基线，则使用校准得到的 $MDF_{relax}$")
    md.append("")
    md.append("**EMA 平滑**：疲劳度变化是缓慢的生理过程（10～60 秒时间尺度），使用 $\\alpha = 0.1$ 的 EMA 平滑：")
    md.append("")
    md.append("$$")
    md.append(r"F_{smoothed}(t) = F_{smoothed}(t-1) \\times 0.9 + F_{raw}(t) \\times 0.1")
    md.append("$$")
    md.append("")
    md.append("> **创新点：动态基线设计**。传统方法使用校准时的 $MDF_{relax}$ 作为固定基线，存在日间漂移问题（电极位置变化、皮肤阻抗变化等）。本算法采用「每次收缩独立基线」：每次肌肉收缩开始时自动捕获当前 MDF 作为基线，这样即使电极有轻微位移，也能正确反映本次收缩内的疲劳趋势。")
    md.append("")

    md.append("## 3.6 信号质量评估")
    md.append("")
    md.append("信号质量（0～100 分）实时反映当前 sEMG 信号是否可信，用于用户界面提示用户调整电极位置。")
    md.append("")
    md.append("$$")
    md.append(r"Quality = RMS\\_score + MDF\\_score + Continuity\\_score = 35 + 35 + 30 = 100")
    md.append("$$")
    md.append("")
    md.append("**评分规则**：")
    md.append("")
    md.append("- **RMS 得分（35 分）**：收缩期 RMS 在 0.1～5 mV 为高质量；放松期 RMS < 0.5 mV 为高质量")
    md.append("- **MDF 有效性（35 分）**：$MDF \\in [10, 250]\\ Hz$ 范围内得满分")
    md.append("- **连续性（30 分）**：过去 50 帧中 MDF 有效帧占比 × 30")
    md.append("")

    # ===== 4. 创新亮点 =====
    md.append("# 4. 创新亮点")
    md.append("")
    md.append("本项目的算法设计有以下创新点，适合作为高中生科创项目的亮点展示：")
    md.append("")

    md.append("## 亮点一：基于 MDF 的动态基线疲劳检测")
    md.append("")
    md.append("传统 sEMG 疲劳检测使用校准时的 MDF 作为固定基线，存在日间漂移问题。本算法创新地采用「每次收缩独立基线」策略：")
    md.append("")
    md.append("- 当激活度从 <20% 跨越到 >20% 时，自动捕获当前 MDF 作为本次收缩的基线")
    md.append("- 这样即使电极有轻微位移，也能正确反映本次收缩内的疲劳趋势")
    md.append("- 该设计提高了算法的实用性和长期稳定性")
    md.append("")
    md.append("> **学术价值**：这是运动生理信号处理的常见改进方向，相关思路在文献 [3] Merletti (2004) 中也有提及。作为高中生项目，自主实现此功能体现了算法设计的问题意识。")
    md.append("")

    md.append("## 亮点二：自适应 EMA 平滑参数")
    md.append("")
    md.append("MDF 的 EMA 平滑参数 $\\alpha$ 不是固定值，而是根据信号状态自适应调整。固定 $\\alpha$ 的 EMA 是常见做法，但本算法根据生理含义自适应调整 $\\alpha$，这是一个体现「算法针对性设计」的亮点。")
    md.append("")

    md.append("## 亮点三：极低资源的嵌入式实现")
    md.append("")
    md.append("Arduino UNO R4 WiFi 仅有 32KB RAM 和 48MHz 主频，在这样的限制下实现实时 FFT + MDF 计算是一个工程亮点：")
    md.append("")
    md.append("- FFT 旋转因子预计算并存储在 BSS 段（`static` 数组），避免每次计算重新生成")
    md.append("- 使用 256 点 FFT（而非 512 点），在满足频率分辨率的同时控制 RAM 占用")
    md.append("- 环形缓冲区设计避免大数组的栈分配（RA4M1 主栈仅 1KB）")
    md.append(f"- 固件编译后 RAM 使用率约 **58.7%**（约 19KB / 32KB），在严格限制下成功实现全部功能")
    md.append("")

    md.append("## 亮点四：完整的本地 + 云端数据闭环")
    md.append("")
    md.append("固件端完成全部算法计算，结果（RMS、MDF、激活度、疲劳度）通过 WiFi 每 3 秒上传至微信云开发平台，用户可在微信小程序上实时查看，并支持历史数据查询。相比传统「传感器采集 → 传输到计算机 → 计算机软件分析」的流程，本设备实现了「采集 → 计算 → 显示」全链条的嵌入式实现。")
    md.append("")

    # ===== 5. 优缺点 =====
    md.append("# 5. 优点与缺点分析")
    md.append("")

    md.append("## 5.1 优点")
    md.append("")
    md.append("| 优点 | 说明 | 学术/实用价值 |")
    md.append("|------|------|--------------|")
    md.append("| 实时性强 | 固件端 10Hz 计算频率，延迟 < 100ms | 适合运动中的实时反馈 |")
    md.append("| 低功耗便携 | 腕带式设计，USB 供电 | 适合运动科学和康复场景 |")
    md.append("| MDF 动态基线 | 每次收缩自动重新校准基线 | 提高长期使用的稳定性 |")
    md.append("| 自适应 EMA | 根据信号状态调整平滑参数 | 兼顾响应速度和稳定性 |")
    md.append("| 信号质量指示 | 实时评估信号质量 | 提高数据可靠性 |")
    md.append("| 成本极低 | BOM 约 200 元 | 适合教育推广 |")
    md.append("| 云端数据 | 微信小程序 + 云开发 | 用户友好，数据可回溯 |")
    md.append("")

    md.append("## 5.2 缺点与局限性")
    md.append("")
    md.append("| 缺点 | 原因 | 改进方向 |")
    md.append("|------|------|---------|")
    md.append("| 频率分辨率有限 | 256 点 FFT @ 1000Hz → ~3.9 Hz/bin | 增加 FFT 点数（需更多 RAM） |")
    md.append("| MDF 计算依赖频谱质量 | 电极接触不良时功率谱异常 | 已通过信号质量评估缓解 |")
    md.append("| 校准需要主动配合 | 用户需完成 10s 放松 + 15s 最大收缩 | 可考虑无校准模式 |")
    md.append("| 单通道 sEMG | 仅采集一块肌肉 | 硬件扩展（多路 ADC） |")
    md.append("| 疲劳度需主观验证 | MDF 下降与主观疲劳的相关性 | 下一步：受试者对照实验 |")
    md.append("| UNO R4 WiFi 算力限制 | 无法运行更复杂的频域特征 | 升级到 STM32 或 ESP32 |")
    md.append("")
    md.append("> **说明**：作为高中生科创项目，坦诚说明算法的局限性，并在答辩中展示对改进方向的思考，往往比只讲优点更容易获得评委认可。")
    md.append("")

    # ===== 6. 参数 =====
    md.append("# 6. 算法参数说明")
    md.append("")
    md.append("以下参数可在固件代码中调整，以适应不同应用场景：")
    md.append("")
    md.append("| 参数 | 当前值 | 说明 |")
    md.append("|------|--------|------|")
    md.append("| FFT 窗口大小 | 256 点 | 越大频率分辨率越高，但 RAM 占用越多 |")
    md.append("| 采样率 | 1000 Hz | 由 ADC 定时器决定，满足 Nyquist 定理 |")
    md.append("| MDF 频率范围 | 10～250 Hz | 肌电信号有效频谱范围 |")
    md.append("| 激活度收缩阈值 | RMS > 2×RMS_relax | 判定肌肉是否处于收缩状态 |")
    md.append("| 动态基线捕获阈值 | 激活度 > 20% | 触发基线更新的激活度阈值 |")
    md.append("| MDF EMA α（收缩） | 0.35 | 收缩期 MDF 平滑参数 |")
    md.append("| MDF EMA α（稳态） | 0.15 | 稳态 MDF 平滑参数 |")
    md.append("| 疲劳度 EMA α | 0.1 | 疲劳度输出平滑参数 |")
    md.append("| 信号质量窗口 | 50 帧 | 质量评估的滑动窗口大小 |")
    md.append("")

    # ===== 7. 参考文献 =====
    md.append("# 7. 参考文献")
    md.append("")
    md.append("1. De Luca CJ. The use of surface electromyography in biomechanics. *Journal of Applied Biomechanics*, 1997, 13(2):135-163.")
    md.append("2. Merletti R, Knaflitz M, De Luca CJ. Myoelectric manifestations of fatigue in voluntary and electrically elicited contractions. *Journal of Applied Physiology*, 1990, 69(5):1810-1820.")
    md.append("3. Merletti R, Parker PA. *Electromyography: Physiology, Engineering, and Non-Invasive Applications*. IEEE Press/Wiley, 2004.")
    md.append("4. Cifrek M, Medved V, Tonković S, Ostojić S. Surface EMG based muscle fatigue evaluation in biomechanics. *Clinical Biomechanics*, 2009, 24(4):327-340.")
    md.append("5. González-Izal M, Malanda A, Gorostiaga E, Izquierdo M. Electromyographic models to assess muscle fatigue. *Journal of Electromyography and Kinesiology*, 2012, 22(4):501-512.")
    md.append("6. Arduino UNO R4 WiFi 官方文档. https://docs.arduino.cc/hardware/uno-r4-wifi/")
    md.append("7. AD8232 单导联心率监测芯片数据手册. Analog Devices.")
    md.append("")

    md.append("# 附录：核心公式汇总")
    md.append("")
    md.append("| 符号 | 公式 | 说明 |")
    md.append("|------|------|------|")
    md.append("| RMS | $\\sqrt{(1/N)\\sum (x[i] - DC_{bias})^2}$ | 肌肉激活强度（mV） |")
    md.append("| MDF | $\\int P(f)df = 0.5 \\times P_{total}$ | 频谱中心频率（Hz） |")
    md.append("| 激活度 A | $\\text{clamp}((RMS - RMS_r) / (RMS_a - RMS_r) \\times 100, 0, 100)$ | 归一化收缩强度（%） |")
    md.append("| 疲劳度 F | $\\text{clamp}((MDF_{bl} - MDF_{cur}) / MDF_{bl} \\times 100, 0, 100)$ | 基于 MDF 下降的疲劳指数（%） |")
    md.append("| 疲劳度平滑 | $F(t) = F(t-1) \\times 0.9 + F_{raw}(t) \\times 0.1$ | EMA 平滑输出 |")
    md.append("")
    md.append("*注：$RMS_r$ = 放松状态 RMS，$RMS_a$ = 主动收缩 RMS，$MDF_{bl}$ = 动态基线或 $MDF_{relax}$，$N = 256$。*")
    md.append("")

    return "\n".join(md)

def try_pandoc_convert(md_path, docx_path):
    """尝试用 pandoc 将 markdown 转为 docx"""
    import subprocess
    try:
        r = subprocess.run(
            ["pandoc", md_path, "-o", docx_path, "--standalone", "--toc"],
            capture_output=True, text=True, timeout=30
        )
        return r.returncode == 0
    except Exception as e:
        print(f"pandoc 不可用: {e}")
        return False

def main():
    md_content = build_markdown()
    md_path = r"E:\sEMG_B_Project\docs\算法说明_临时.md"
    docx_path = r"E:\sEMG_B_Project\docs\sEMG_算法说明文档.docx"

    # 先写 markdown
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"✅ Markdown 已生成: {md_path}")

    # 尝试 pandoc
    if try_pandoc_convert(md_path, docx_path):
        print(f"✅ Word 文档已生成: {docx_path}")
        os.remove(md_path)
        return

    # pandoc 不可用，尝试 python-docx
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        print("使用 python-docx 生成文档...")
        # python-docx 可用，生成简化版
        doc = Document()
        # 由于内容很多，这里只生成基本结构
        # 实际上上面的 markdown 已经很完整了
        # 建议用户手动用 pandoc 或 Word 打开 markdown 另存为 docx
        print("python-docx 可用，但建议用 pandoc 生成更精美的文档")
        print(f"Markdown 文件路径: {md_path}")
        print("建议执行: pandoc 算法说明_临时.md -o sEMG_算法说明文档.docx --standalone")
        return
    except ImportError:
        print("python-docx 未安装")

    print(f"\n✅ 算法说明 Markdown 已生成：")
    print(f"   {md_path}")
    print(f"\n转 Word 方案（三选一）：")
    print(f"  1. 安装 pandoc 后执行：pandoc \"{md_path}\" -o \"{docx_path}\" --standalone")
    print(f"  2. 用 Word 打开 .md 文件，另存为 .docx")
    print(f"  3. 安装 python-docx: pip install python-docx，然后重新运行本脚本")

if __name__ == "__main__":
    main()
