const pptxgen = require("pptxgenjs");

const pptx = new pptxgen();
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';

// === 颜色系统 ===
const C = {
  title: "#1A1A2E",
  body: "#5A5A6E",
  green: "#00B84D",
  blue: "#2979FF",
  orange: "#F5A623",
  red: "#E53E3E",
  darkOrange: "#F57C00",
  white: "#FFFFFF",
  bgGray: "#F5F5F7",
  border: "#E8E8ED",
};

const fonts = { title: "微软雅黑", body: "微软雅黑" };
const PIC_DIR = "E:/sEMG_B_Project/docs/pic";
const IMG_Y = 1.1;
const IMG_H = 5.6;

// === 工具函数 ===
function addSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  return slide;
}

function addPageHeader(slide, sectionNum, title, subtitle) {
  slide.addText(title, {
    x: 0.4, y: 0.2, w: 10.0, h: 0.5,
    fontSize: 22, fontFamily: fonts.title, color: C.title, bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.4, y: 0.65, w: 10.0, h: 0.35,
      fontSize: 11, fontFamily: fonts.body, color: C.body,
    });
  }
  slide.addShape({
    type: "rect", x: 11.0, y: 0.2, w: 1.7, h: 0.32,
    fill: { color: C.green }, line: { color: C.green, width: 0 }, rounded: 0.08,
  });
  slide.addText(sectionNum, {
    x: 11.0, y: 0.2, w: 1.7, h: 0.32,
    fontSize: 10, fontFamily: fonts.title, color: C.white, bold: true,
    align: "center", verticalAlign: "middle",
  });
}

// 均匀分布图片：根据图片数量自动计算水平间距
function addImagesEvenly(slide, images) {
  const count = images.length;
  const pageW = 13.333;
  const imgW = 2.5;
  const totalImgW = count * imgW;
  const gap = (pageW - totalImgW) / (count + 1);

  images.forEach((img, i) => {
    const x = gap + i * (imgW + gap);
    slide.addImage({
      path: img.path,
      x: x, y: IMG_Y, w: imgW, h: IMG_H,
      sizing: { type: 'contain', w: imgW, h: IMG_H },
    });
    if (img.caption) {
      slide.addText(img.caption, {
        x: x - 0.3, y: IMG_Y + IMG_H + 0.1, w: imgW + 0.6, h: 0.3,
        fontSize: 9, fontFamily: fonts.body, color: C.body,
        align: "center",
      });
    }
  });
}

// === 1. 封面 ===
function addCover() {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };

  slide.addText("sEMG肌肉疲劳监测", {
    x: 0.5, y: 1.8, w: 10.0, h: 1.2,
    fontSize: 52, fontFamily: fonts.title, color: C.title, bold: true,
  });
  slide.addText("小程序操作指南", {
    x: 0.5, y: 3.1, w: 10.0, h: 0.8,
    fontSize: 30, fontFamily: fonts.title, color: C.green,
  });
  slide.addText("表面肌电信号 · 实时监测 · 疲劳度评估", {
    x: 0.5, y: 4.0, w: 10.0, h: 0.5,
    fontSize: 16, fontFamily: fonts.body, color: C.body,
  });
  slide.addText("高中课题设计作品", {
    x: 0.5, y: 4.8, w: 6.0, h: 0.4,
    fontSize: 14, fontFamily: fonts.body, color: C.body,
  });
}

// === 2. 目录 ===
function addContents() {
  const slide = addSlide();
  slide.addText("目录", {
    x: 0.4, y: 0.2, w: 3, h: 0.5,
    fontSize: 22, fontFamily: fonts.title, color: C.title, bold: true,
  });
  slide.addText("CONTENTS", {
    x: 0.4, y: 0.65, w: 3, h: 0.3,
    fontSize: 10, fontFamily: fonts.body, color: C.body,
  });

  const items = [
    { num: "01", title: "网络配置", desc: "设备WiFi配网" },
    { num: "02", title: "肌电校准", desc: "建立个人基准" },
    { num: "03", title: "实时监测", desc: "多维数据显示" },
    { num: "04", title: "数据分析", desc: "统计趋势图表" },
  ];

  items.forEach((item, i) => {
    const x = 0.6 + (i % 2) * 6.4;
    const y = 1.3 + Math.floor(i / 2) * 1.5;

    slide.addText(item.num, {
      x: x, y: y, w: 0.8, h: 0.5,
      fontSize: 24, fontFamily: fonts.title, color: C.green, bold: true,
    });
    slide.addText(item.title, {
      x: x + 1.0, y: y + 0.05, w: 4.5, h: 0.4,
      fontSize: 17, fontFamily: fonts.title, color: C.title, bold: true,
    });
    slide.addText(item.desc, {
      x: x + 1.0, y: y + 0.5, w: 4.5, h: 0.3,
      fontSize: 11, fontFamily: fonts.body, color: C.body,
    });
  });
}

// === 3. 网络配置（5张图）===
function addNetworkConfig() {
  const slide = addSlide();
  addPageHeader(slide, "01", "网络配置", "扫描设备 → 连接 → 输入WiFi凭证 → 配网完成");

  addImagesEvenly(slide, [
    { path: `${PIC_DIR}/网络配置/1.jpg`, caption: "① 未连接状态" },
    { path: `${PIC_DIR}/网络配置/2.jpg`, caption: "② 设备已连接" },
    { path: `${PIC_DIR}/网络配置/3.jpg`, caption: "③ 输入WiFi" },
    { path: `${PIC_DIR}/网络配置/4.jpg`, caption: "④ 配网进行中" },
    { path: `${PIC_DIR}/网络配置/5.jpg`, caption: "⑤ 配网完成" },
  ]);
}

// === 4. 肌电校准 · 录入信息（2张图）===
function addCalibrationPage1() {
  const slide = addSlide();
  addPageHeader(slide, "02", "肌电校准", "录入个人信息 → 确认开始校准");

  addImagesEvenly(slide, [
    { path: `${PIC_DIR}/肌电校准/0.jpg`, caption: "① 校准入口" },
    { path: `${PIC_DIR}/肌电校准/1.jpg`, caption: "② 校准主界面" },
  ]);
}

// === 5. 肌电校准 · 采集阶段（5张图）===
function addCalibrationPage2() {
  const slide = addSlide();
  addPageHeader(slide, "02", "肌电校准", "静息态采集 → 最大收缩采集 → 校准完成 → 进入监测");

  addImagesEvenly(slide, [
    { path: `${PIC_DIR}/肌电校准/2.jpg`, caption: "③ 录入信息" },
    { path: `${PIC_DIR}/肌电校准/3.jpg`, caption: "④ 确认校准" },
    { path: `${PIC_DIR}/肌电校准/4.jpg`, caption: "⑤ 静息态采集" },
    { path: `${PIC_DIR}/肌电校准/5.jpg`, caption: "⑥ 最大收缩采集" },
    { path: `${PIC_DIR}/肌电校准/6.jpg`, caption: "⑦ 校准完成" },
  ]);
}

// === 6. 实时监测（2张图）===
function addRealtimePage() {
  const slide = addSlide();
  addPageHeader(slide, "03", "实时监测", "已校准：显示疲劳度 | 未校准：仅显示RMS/MDF");

  addImagesEvenly(slide, [
    { path: `${PIC_DIR}/实时监测/1.jpg`, caption: "① 已校准状态" },
    { path: `${PIC_DIR}/实时监测/2.jpg`, caption: "② 未校准状态" },
  ]);
}

// === 7. 实时监测 · 指标解读（表格）===
function addMetricsTable() {
  const slide = addSlide();
  addPageHeader(slide, "03", "指标解读", "核心参数含义与计算方式");

  const headers = ["指标", "单位", "含义", "计算方式"];
  const rows = [
    ["RMS", "mV", "均方根幅值，反映肌肉收缩力度", "归一化：0%=放松，100%=最大收缩"],
    ["MDF", "Hz", "中位频率，疲劳时功率谱向低频偏移", "信号功率谱累积达50%的频率点，疲劳时逐渐下降"],
    ["收缩力度", "%", "当前肌肉收缩强度百分比", "基于静息态与最大收缩态基准值计算"],
    ["疲劳度", "%", "肌肉疲劳程度评估", "(收缩起始MDF-当前MDF)/收缩起始MDF×100%"],
    ["信号质量", "%", "数据可靠性综合评分", "RMS合理性 + MDF有效性 + 连续性，越高越可靠"],
  ];

  // 构建带颜色的单元格（第一列彩色）
  const firstColColors = [C.green, C.blue, C.orange, C.red, C.title];
  const tableData = [
    headers.map(h => ({ text: h, options: { bold: true, color: C.green, fontSize: 12, align: "left", valign: "middle" } })),
    ...rows.map((row, ri) => row.map((cell, ci) => ({
      text: cell,
      options: {
        color: ci === 0 ? firstColColors[ri] : (ci < 3 ? C.title : C.body),
        fontSize: 11,
        bold: ci === 0,
        align: "left",
        valign: "middle",
      },
    }))),
  ];

  slide.addTable(tableData, {
    x: 0.5, y: 1.2, w: 12.3, h: 5.8,
    colW: [1.3, 1.0, 3.8, 6.2],
    rowH: [0.5, 1.06, 1.06, 1.06, 1.06, 1.06],
    border: { pt: 1, color: C.border },
    fill: { color: C.white },
    autoPage: false,
  });
}

// === 8. 数据分析（4张图）===
function addDataAnalysisPage1() {
  const slide = addSlide();
  addPageHeader(slide, "04", "数据分析", "数据统计 · 趋势图表 · 数据导出 · 原始数据格式");

  addImagesEvenly(slide, [
    { path: `${PIC_DIR}/数据分析/1.jpg`, caption: "① 今日统计" },
    { path: `${PIC_DIR}/数据分析/2.jpg`, caption: "② 昨日统计" },
    { path: `${PIC_DIR}/数据分析/3.jpg`, caption: "③ 趋势图表" },
    { path: `${PIC_DIR}/数据分析/4.jpg`, caption: "④ 峰值建议" },
  ]);
}

// === 9. 数据分析 · 数据导出（2张图）===
function addDataAnalysisPage2() {
  const slide = addSlide();
  addPageHeader(slide, "04", "数据分析", "CSV数据导出与微信分享 · 原始数据格式");

  // 左侧手机截图
  slide.addImage({
    path: `${PIC_DIR}/数据分析/5.jpg`,
    x: 2.0, y: IMG_Y, w: 2.5, h: IMG_H,
    sizing: { type: 'contain', w: 2.5, h: IMG_H },
  });
  slide.addText("① 数据导出与微信分享", {
    x: 1.7, y: IMG_Y + IMG_H + 0.1, w: 3.1, h: 0.3,
    fontSize: 9, fontFamily: fonts.body, color: C.body,
    align: "center",
  });

  // 右侧横屏CSV截图
  slide.addImage({
    path: `${PIC_DIR}/数据分析/6.jpg`,
    x: 6.0, y: 2.0, w: 5.8, h: 3.8,
    sizing: { type: 'contain', w: 5.8, h: 3.8 },
  });
  slide.addText("② CSV原始数据格式（Excel打开）", {
    x: 6.0, y: 5.9, w: 5.8, h: 0.3,
    fontSize: 9, fontFamily: fonts.body, color: C.body,
    align: "center",
  });
}

// === 生成 ===
addCover();
addContents();
addNetworkConfig();
addCalibrationPage1();
addCalibrationPage2();
addRealtimePage();
addMetricsTable();
addDataAnalysisPage1();
addDataAnalysisPage2();

pptx.writeFile({ fileName: "E:/sEMG_B_Project/docs/deck_workspace/sEMG肌肉疲劳监测_操作指南_new.pptx" })
  .then(() => { console.log("PPT generated successfully!"); })
  .catch((err) => { console.error("Error:", err); });
