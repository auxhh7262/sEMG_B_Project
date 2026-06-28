const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
        VerticalAlign, LevelFormat, PageNumber, PageBreak } = require('docx');

// 颜色
const C = {
  h1: "1F3864",   // 深蓝
  h2: "2E5A9C",   // 中蓝
  accent: "1A6FB8",
  codeBg: "F0F4F8",
  tableHead: "1F3864",
  tableAlt: "E8F0FA",
  highlight: "FFF3CD",
};

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: C.h1 })],
    spacing: { before: 480, after: 240 },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 28, font: "Arial", color: C.h2 })],
    spacing: { before: 360, after: 180 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, size: 24, font: "Arial", color: C.accent })],
    spacing: { before: 240, after: 120 },
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [typeof text === 'string'
      ? new TextRun({ text, font: "Arial", size: 22, ...opts })
      : text],
    spacing: { after: 120 },
    ...opts,
  });
}

function codeBlock(code) {
  // 分割行，每行一个段落
  const lines = code.split('\n');
  return lines.map(line =>
    new Paragraph({
      children: [new TextRun({ text: line, font: "Consolas", size: 18, color: "333333" })],
      spacing: { after: 40 },
      indent: { left: 720 },
      shading: { fill: C.codeBg, type: ShadingType.CLEAR },
    })
  );
}

function bullet(items, level = 0) {
  return items.map(item =>
    new Paragraph({
      children: [new TextRun({ text: item, font: "Arial", size: 22 })],
      spacing: { after: 80 },
      indent: { left: 720 + level * 360, hanging: 360 },
      bullet: { level },
    })
  );
}

function numbered(items) {
  return items.map((item, i) =>
    new Paragraph({
      children: [new TextRun({ text: `${i + 1}. ${item}`, font: "Arial", size: 22 })],
      spacing: { after: 80 },
      indent: { left: 720 },
    })
  );
}

function table(headers, rows, colWidths) {
  const totalW = 9360;
  const cw = colWidths || headers.map(() => Math.floor(totalW / headers.length));
  const makeCell = (text, isHead = false, fill = null) => new TableCell({
    borders,
    width: { size: cw[0] || 2000, type: WidthType.DXA },
    shading: { fill: fill || (isHead ? C.tableHead : "FFFFFF"), type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({
        text,
        font: "Arial",
        size: 20,
        bold: isHead,
        color: isHead ? "FFFFFF" : "000000",
      })],
      alignment: isHead ? AlignmentType.CENTER : AlignmentType.LEFT,
    })],
  });

  const headerRow = new TableRow({
    children: headers.map(h => makeCell(h, true)),
    tableHeader: true,
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        makeCell(cell, false, ri % 2 === 0 ? C.tableAlt : "FFFFFF")
      ),
    })
  );

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: cw,
    rows: [headerRow, ...dataRows],
  });
}

function formulaBlock(formula, explanation) {
  return [
    new Paragraph({
      children: [new TextRun({ text: formula, font: "Consolas", size: 22, bold: true, color: C.accent })],
      spacing: { before: 120, after: 40 },
      indent: { left: 720 },
      shading: { fill: "F0F8FF", type: ShadingType.CLEAR },
    }),
    ...(explanation ? [p(explanation, { indent: { left: 720 } })] : []),
  ];
}

// ===== 主文档 =====
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: C.h1 },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: C.h2 },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: C.accent },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 }
      },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        orientation: "portrait",
      },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
    },
    children: [

      // ===== 封面 =====
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400, after: 480 },
        children: [new TextRun({
          text: "sEMG 肌电信号疲劳检测算法说明",
          font: "Arial", size: 40, bold: true, color: C.h1,
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Algorithm Description for High School Research Project",
          font: "Arial", size: 24, color: "666666",
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({
          text: "基于 Arduino UNO R4 WiFi 的便携式肌肉疲劳监测设备",
          font: "Arial", size: 22, color: "888888",
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 1200 },
        children: [new TextRun({
          text: "2026年6月",
          font: "Arial", size: 22, color: "888888",
        })],
      }),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== 目录（示意）=====
      h1("目录"),
      ...bullet([
        "1. 项目背景与意义",
        "2. 算法整体架构",
        "3. 核心算法详解",
        "   3.1 信号采集与预处理",
        "   3.2 RMS（均方根）计算",
        "   3.3 MDF（中值频率）计算",
        "   3.4 激活度（Activation）计算",
        "   3.5 疲劳度（Fatigue）计算",
        "   3.6 信号质量评估",
        "4. 创新亮点",
        "5. 优点与缺点分析",
        "6. 算法参数说明",
        "7. 参考文献",
      ], 0),

      new Paragraph({ children: [new PageBreak()] }),

      // ===== 1. 项目背景 =====
      h1("1. 项目背景与意义"),
      p("肌肉疲劳的实时监测在运动科学、康复医学和人机交互中具有重要意义。表面肌电信号（sEMG）是一种通过皮肤表面电极采集肌肉电活动的非侵入式技术，已广泛应用于肌肉状态评估。"),
      p("传统 sEMG 疲劳检测设备通常依赖昂贵的专用仪器和计算机端软件，不便携且成本高。本项目基于 Arduino UNO R4 WiFi 开发了一款便携式 sEMG 疲劳监测设备，具有以下特点："),
      ...bullet([
        "低成本：BOM 成本约 200 元人民币（AD8232 传感器 + UNO R4 WiFi + 电平转换）",
        "便携：腕带式设计，可实时在手机微信小程序上查看数据",
        "云端：数据通过 WiFi 上传至微信云开发平台，支持历史分析",
        "自主算法：固件端实现完整的 RMS、MDF、激活度、疲劳度计算，无需计算机端处理",
      ]),
      p("本算法说明文档面向高中生科创项目评审，重点阐述核心算法的原理、创新亮点及优缺点，帮助读者理解项目的学术价值。"),

      // ===== 2. 算法整体架构 =====
      h1("2. 算法整体架构"),
      p("算法运行在 Arduino UNO R4 WiFi（瑞萨 RA4M1 芯片，主频 48MHz，RAM 32KB）上，采用定时器中断驱动采样，在主循环中完成全部信号处理。整体流程如下："),

      table(
        ["步骤", "处理内容", "输出"],
        [
          ["1", "ADC 中断采样（1000Hz）", "原始 sEMG 电压信号"],
          ["2", "环形缓冲区管理", "512 点滑动窗口"],
          ["3", "RMS 计算（256 点窗口）", "肌肉激活强度（mV）"],
          ["4", "FFT + 功率谱", "频谱分布"],
          ["5", "MDF 计算（中值频率）", "频谱中心位置（Hz）"],
          ["6", "激活度归一化", "0~100%"],
          ["7", "疲劳度计算（MDF 下降率）", "0~100%"],
          ["8", "信号质量评估", "0~100 分"],
        ],
        [1800, 3200, 4360]
      ),

      p("【关键设计决策】由于 RA4M1 的 RAM 仅 32KB，FFT 使用 256 点（而非 512 点），以减少内存占用。频谱计算采用自实现定点 FFT（库仑复数旋转因子预计算），避免依赖大型 FFT 库。"),

      // ===== 3. 核心算法详解 =====
      h1("3. 核心算法详解"),

      h2("3.1 信号采集与预处理"),
      p("AD8232 传感器输出经 BSS138 电平转换（3.3V ↔ 5V）后，接入 UNO R4 WiFi 的 14 位 ADC（量程 0~3.3V）。采样由硬件定时器中断驱动，固定 1000Hz："),
      ...codeBlock("// main.cpp — ADC 定时器配置\nADC::adc_timer.begin([]() {\n  int16_t adcVal = analogRead(ADC_PIN);\n  gSignalProcessor.isrPushSample(adcVal);\n}, 1000.0f);  // 1000 Hz"),
      p("【环形缓冲区设计】使用 512 点的环形缓冲区（RING_BUFFER_SIZE = 512），写指针由中断上下文更新，读指针由主循环更新。采用 volatile 变量保护，避免中断与主循环之间的数据竞争。"),
      p("【DC 偏移去除】sEMG 信号含有电极与皮肤接触产生的 DC 偏移，计算 RMS 前需去除。采用窗口内简单均值法（而非去极值均值），因为 256 点已足够稳定，且去极值会破坏时序："),
      ...formulaBlock(
        "DC_bias = (1/N) × Σ_{i=0}^{N-1} x[i]",
        "其中 N = 256（FFT 窗口大小），x[i] 为 ADC 原始采样值（单位：mV）"
      ),

      h2("3.2 RMS（均方根）计算"),
      p("RMS 反映肌肉收缩时的信号总功率，与收缩强度正相关，是激活度归一化的基础。"),
      ...formulaBlock(
        "RMS = √[ (1/N) × Σ_{i=0}^{N-1} (x[i] - DC_bias)² ]",
        "N = 256，x[i] 为去除 DC 偏移后的交流分量（单位：mV）"
      ),
      p("【设计要点】RMS 计算使用 256 点 Hamming 窗前的原始信号（不含窗函数），因为 RMS 反映的是时域能量，加窗会影响幅值准确性。窗函数仅用于后续的 FFT 频谱分析。"),

      h2("3.3 MDF（中值频率）计算"),
      p("MDF（Median Frequency，中值频率）是肌电信号频谱的中心位置，肌肉疲劳时 MDF 会系统性下降。这是本算法的核心疲劳指标，大量文献已验证其可靠性。"),

      p("【FFT 实现】使用 256 点实数 FFT（自实现，旋转因子预计算），加 Hamming 窗减少频谱泄露："),
      ...codeBlock("// Hamming 窗\nw[i] = 0.5 × (1 - cos(2πi / (N-1)))\n// 加窗后的信号\nx_windowed[i] = (x[i] - DC_bias) × w[i]"),

      p("【MDF 定义】MDF 是使下式成立的频率 f_mdf："),
      ...formulaBlock(
        "∫_{f_min}^{f_mdf} P(f) df = ∫_{f_mdf}^{f_max} P(f) df = 0.5 × ∫_{f_min}^{f_max} P(f) df",
        "P(f) 为功率谱密度，f_min = 10 Hz，f_max = 250 Hz"
      ),

      p("【MDF 计算步骤】"),
      ...numbered([
        "计算功率谱：P[k] = (Re[k]² + Im[k]²) / N，k = 0 ~ N/2-1",
        "计算总功率：P_total = Σ P[k]（k 对应 10~250 Hz）",
        "若 P_total < 10⁻¹²，视为信号太弱，返回 -1（跳过本次）",
        "累积功率，找到使累积功率 ≥ 0.5 × P_total 的 bin",
        "线性插值获得精确 MDF 值",
      ]),

      p("【EMA 平滑】原始 MDF 值逐帧波动较大，采用指数移动平均（EMA）平滑："),
      ...formulaBlock(
        "MDF_current = MDF_last × (1 - α) + MDF_raw × α",
        "收缩期/MDF 下降期：α = 0.35（快速跟踪）| 稳态：α = 0.15（平滑）"
      ),
      p("α 值自适应选择：收缩状态（isContracting = true）或 MDF 下降时使用较大 α（0.35），以快速跟踪频谱变化；稳态时使用较小 α（0.15），抑制逐帧抖动。"),

      h2("3.4 激活度（Activation）计算"),
      p("激活度将实时 RMS 归一化到 0~100%，直观反映肌肉收缩强度。"),
      ...formulaBlock(
        "A(%) = clamp( (RMS_current - RMS_relax) / (RMS_active - RMS_relax) × 100%,  0, 100 )",
        "RMS_relax：校准得到的放松状态 RMS（10 秒静息均值）\nRMS_active：校准得到的主动收缩 RMS（15 秒最大收缩峰值）"
      ),
      p("【物理意义】A = 0% 表示完全放松，A = 100% 表示达到了校准时的最大收缩强度。"),

      h2("3.5 疲劳度（Fatigue）计算"),
      p("疲劳度是本算法的核心输出，基于 MDF 下降幅度计算，归一化到 0~100%。"),

      p("【公式】"),
      ...formulaBlock(
        "F_raw(%) = clamp( (MDF_baseline - MDF_current) / MDF_baseline × 100%,  0, 100 )",
        "MDF_baseline：动态基线，取本次收缩开始时的 MDF 值（A 从 <20% 跨越到 >20% 时捕获）\n若无可用的动态基线，则使用校准得到的 MDF_relax"
      ),

      p("【EMA 平滑】疲劳度变化是缓慢的生理过程（10~60 秒时间尺度），使用 α = 0.1 的 EMA 平滑："),
      ...formulaBlock(
        "F_smoothed(t) = F_smoothed(t-1) × 0.9 + F_raw(t) × 0.1",
        "α = 0.1 对应时间常数约 10 帧（0.5 秒 @ 20Hz 输出频率），有效抑制抖动"
      ),

      p("【动态基线设计亮点】传统方法使用校准时的 MDF_relax 作为固定基线，但 MDF 存在日间漂移（电极位置变化、皮肤阻抗变化等）。本算法采用「每次收缩独立基线」："),
      ...bullet([
        "每次肌肉收缩开始时（激活度从 <20% 上升到 >20%），自动捕获当前 MDF 作为本次收缩的基线",
        "这样即使电极有轻微位移，也能正确反映本次收缩内的疲劳趋势",
        "避免了固定基线导致的日间不可比问题",
      ]),

      h2("3.6 信号质量评估"),
      p("信号质量（0~100 分）实时反映当前 sEMG 信号是否可信，用于用户界面提示用户调整电极位置。"),
      ...formulaBlock(
        "Quality = RMS_score + MDF_score + Continuity_score\n= 35 + 35 + 30 = 100（满分）",
      ),
      p("评分规则："),
      ...bullet([
        "RMS 得分（35 分）：收缩期 RMS 在 0.1~5 mV 为高质量；放松期 RMS < 0.5 mV 为高质量",
        "MDF 有效性（35 分）：MDF 在 [10, 250] Hz 范围内得满分",
        "连续性（30 分）：过去 50 帧中 MDF 有效帧占比 × 30",
      ]),

      // ===== 4. 创新亮点 =====
      new Paragraph({ children: [new PageBreak()] }),
      h1("4. 创新亮点"),
      p("本项目的算法设计有以下创新点，适合作为高中生科创项目的亮点展示："),

      h2("亮点一：基于 MDF 的动态基线疲劳检测"),
      p("传统 sEMG 疲劳检测使用校准时的 MDF 作为固定基线，存在日间漂移问题。本算法创新地采用「每次收缩独立基线」策略："),
      ...bullet([
        "当激活度从 <20% 跨越到 >20% 时，自动捕获当前 MDF 作为本次收缩的基线",
        "这样即使电极有轻微位移，也能正确反映本次收缩内的疲劳趋势",
        "该设计提高了算法的实用性和长期稳定性",
      ]),
      p("【学术价值】这是运动生理信号处理的常见改进方向，相关思路在文献 [3] Merletti (2004) 中也有提及。作为高中生项目，自主实现此功能体现了算法设计的问题意识。"),

      h2("亮点二：自适应 EMA 平滑参数"),
      p("MDF 的 EMA 平滑参数 α 不是固定值，而是根据信号状态自适应调整："),
      table(
        ["信号状态", "α 值", "设计理由"],
        [
          ["收缩期 / MDF 下降", "0.35", "快速跟踪频谱变化，避免滞后"],
          ["稳态期（>10 帧）", "0.15", "抑制逐帧抖动，输出平滑"],
          ["启动过渡（<10 帧）", "0.5→0.15 线性过渡", "避免初始值偏差导致长时间收敛"],
        ],
        [2200, 1400, 5760]
      ),
      p("【亮点】固定 α 的 EMA 是常见做法，但本算法根据生理含义自适应调整 α，这是一个体现「算法针对性设计」的亮点，适合在答辩中展示。"),

      h2("亮点三：极低资源的嵌入式实现"),
      p("Arduino UNO R4 WiFi 仅有 32KB RAM 和 48MHz 主频，在这样的限制下实现实时 FFT + MDF 计算是一个工程亮点："),
      ...bullet([
        "FFT 旋转因子预计算并存储在 BSS 段（static 数组），避免每次计算重新生成",
        "使用 256 点 FFT（而非 512 点），在满足频率分辨率（~3.9 Hz/bin @ 1000Hz）的同时控制 RAM 占用",
        "环形缓冲区设计避免大数组的栈分配（RA4M1 主栈仅 1KB）",
        "所有浮点运算使用 float（32 位），在精度和速度间取得平衡",
      ]),
      p("【RAM 占用】固件编译后 RAM 使用率约 58.7%（约 19KB / 32KB），在严格限制下成功实现全部功能。"),

      h2("亮点四：完整的本地 + 云端数据闭环"),
      p("固件端完成全部算法计算，结果（RMS、MDF、激活度、疲劳度）通过 WiFi 每 3 秒上传至微信云开发平台，用户可在微信小程序上实时查看，并支持历史数据查询。"),
      p("【架构优势】相比传统「传感器采集 → 传输到计算机 → 计算机软件分析」的流程，本设备实现了「采集 → 计算 → 显示」全链条的嵌入式实现，真正做到了便携和实时。"),

      // ===== 5. 优点与缺点 =====
      new Paragraph({ children: [new PageBreak()] }),
      h1("5. 优点与缺点分析"),

      h2("5.1 优点"),
      table(
        ["优点", "说明", "学术/实用价值"],
        [
          ["实时性强", "固件端 10Hz 计算频率，延迟 < 100ms", "适合运动中的实时反馈"],
          ["低功耗便携", "腕带式设计，USB 供电，可长时间监测", "适合运动科学和康复场景"],
          ["MDF 动态基线", "每次收缩自动重新校准基线", "提高长期使用的稳定性"],
          ["自适应 EMA", "根据信号状态调整平滑参数", "兼顾响应速度和稳定性"],
          ["信号质量指示", "实时评估信号质量，提示用户调整电极", "提高数据可靠性"],
          ["成本极低", "BOM 约 200 元，远低于商用 sEMG 设备（数千至数万元）", "适合教育推广"],
          ["云端数据", "微信小程序 + 云开发，无需安装 App", "用户友好，数据可回溯"],
        ],
        [2000, 3200, 4160]
      ),

      h2("5.2 缺点与局限性"),
      table(
        ["缺点", "原因", "改进方向"],
        [
          ["频率分辨率有限", "256 点 FFT @ 1000Hz → ~3.9 Hz/bin", "增加 FFT 点数（需更多 RAM）或使用零填充"],
          ["MDF 计算依赖频谱质量", "电极接触不良时功率谱异常，MDF 不可靠", "已通过信号质量评估缓解"],
          ["校准需要主动配合", "用户需完成 10 秒放松 + 15 秒最大收缩", "可考虑无校准模式（使用群体平均值）"],
          ["单通道 sEMG", "仅采集一块肌肉，无法做多肌群协同分析", "硬件扩展（多路 ADC）"],
          ["疲劳度需主观验证", "MDF 下降与主观疲劳的相关性需用户实验验证", "下一步工作：招募受试者做对照实验"],
          ["UNO R4 WiFi 算力限制", "无法运行更复杂的频域特征（如波形长度、过零点等）", "升级到 STM32 或 ESP32"],
        ],
        [2000, 3200, 4160]
      ),

      p("【诚实性评价】作为高中生科创项目，坦诚说明算法的局限性，并在答辩中展示对改进方向的思考，往往比只讲优点更容易获得评委认可。"),

      // ===== 6. 算法参数说明 =====
      new Paragraph({ children: [new PageBreak()] }),
      h1("6. 算法参数说明"),
      p("以下参数可在固件代码中调整，以适应不同应用场景："),
      table(
        ["参数", "当前值", "说明"],
        [
          ["FFT 窗口大小", "256 点", "越大频率分辨率越高，但 RAM 占用越多"],
          ["采样率", "1000 Hz", "由 ADC 定时器决定，满足 Nyquist 定理（肌电信号 < 500 Hz）"],
          ["MDF 频率范围", "10~250 Hz", "肌电信号有效频谱范围"],
          ["激活度收缩阈值", "RMS > 2×RMS_relax", "判定肌肉是否处于收缩状态"],
          ["动态基线捕获阈值", "激活度 > 20%", "触发基线更新的激活度阈值"],
          ["MDF EMA α（收缩）", "0.35", "收缩期 MDF 平滑参数"],
          ["MDF EMA α（稳态）", "0.15", "稳态 MDF 平滑参数"],
          ["疲劳度 EMA α", "0.1", "疲劳度输出平滑参数"],
          ["信号质量窗口", "50 帧", "质量评估的滑动窗口大小"],
        ],
        [2800, 1400, 5160]
      ),

      // ===== 7. 参考文献 =====
      new Paragraph({ children: [new PageBreak()] }),
      h1("7. 参考文献"),
      ...numbered([
        "De Luca CJ. The use of surface electromyography in biomechanics. Journal of Applied Biomechanics, 1997, 13(2):135-163.",
        "Merletti R, Knaflitz M, De Luca CJ. Myoelectric manifestations of fatigue in voluntary and electrically elicited contractions. Journal of Applied Physiology, 1990, 69(5):1810-1820.",
        "Merletti R, Parker PA. Electromyography: Physiology, Engineering, and Non-Invasive Applications. IEEE Press/Wiley, 2004.",
        "Cifrek M, Medved V, Tonković S, Ostojić S. Surface EMG based muscle fatigue evaluation in biomechanics. Clinical Biomechanics, 2009, 24(4):327-340.",
        "González-Izal M, Malanda A, Gorostiaga E, Izquierdo M. Electromyographic models to assess muscle fatigue. Journal of Electromyography and Kinesiology, 2012, 22(4):501-512.",
        "Arduino UNO R4 WiFi 官方文档. https://docs.arduino.cc/hardware/uno-r4-wifi/",
        "AD8232 单导联心率监测芯片数据手册. Analog Devices.",
      ]),

      // ===== 附录：公式汇总 =====
      new Paragraph({ children: [new PageBreak()] }),
      h1("附录：核心公式汇总"),
      table(
        ["符号", "公式", "说明"],
        [
          ["RMS", "√( (1/N)Σ(x[i] - DC_bias)² )", "肌肉激活强度（mV）"],
          ["MDF", "∫P(f)df (f_min→MDF) = 0.5×P_total", "频谱中心频率（Hz）"],
          ["激活度 A", "clamp((RMS - RMS_r) / (RMS_a - RMS_r) × 100, 0, 100)", "归一化收缩强度（%）"],
          ["疲劳度 F_raw", "clamp((MDF_bl - MDF_cur) / MDF_bl × 100, 0, 100)", "基于 MDF 下降的疲劳指数（%）"],
          ["疲劳度 F_smooth", "F(t-1)×0.9 + F_raw(t)×0.1", "EMA 平滑输出"],
        ],
        [1600, 3400, 4360]
      ),
      p("注：RMS_r = 放松状态 RMS，RMS_a = 主动收缩 RMS，MDF_bl = 动态基线或 MDF_relax，N = 256。"),

      // 页脚
      new Paragraph({
        spacing: { before: 960 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "— 第 ", font: "Arial", size: 18, color: "888888" }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" }),
          new TextRun({ text: " 页 —", font: "Arial", size: 18, color: "888888" }),
        ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = "E:\\sEMG_B_Project\\docs\\sEMG_算法说明文档.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("✅ 文档已生成：" + outPath);
}).catch(err => {
  console.error("❌ 生成失败：" + err.message);
  process.exit(1);
});
