---
name: docx-toolkit
description: "Markdown -> Word 文档转换工具集：MD→Word（技术文档，深蓝网格表）与 MD→论文版Word（三线表）两种输出。两者排版（页面 A4/页码、宋体小四正文、黑体标题、公式编号、图名）完全一致，唯一区别是表格样式。触发词：'md转word'、'markdown转docx'、'生成docx'、'论文格式word'。支持双击 GUI 与 CLI 双模式；论文格式要求依据 docs/资料/格式模板/ 下的拆分规范 02-论文格式与结构规范.docx、03-论文排版与参考文献规范.docx（原「论文 文档格式 2019-10-23.doc」已拆分为 01~05 共 5 份规范）。"
---

# docx-toolkit — Markdown → Word 转换工具集

统一的项目文档转换工具，**全部内联在单个 `docx-toolkit.pyw` 中**，聚焦 **Markdown → Word** 两条主线：

- MD → Word（技术文档：**深蓝网格表**；其余排版与论文版完全相同）
- MD → 论文版 Word（**三线表**；页面 A4/页码、宋体小四、黑体标题、公式编号、图名与 tech 完全相同，唯独表格为三线表）

> **论文格式要求**：从 Markdown 生成 Word 时即按 `docs/资料/格式模板/02-论文格式与结构规范.docx`、`03-论文排版与参考文献规范.docx` 的规范套用字体、段落间距等（原「论文 文档格式 2019-10-23.doc」已拆分为 01~05 共 5 份规范，见下「论文模式」）。

## 功能矩阵

| 子命令 / 功能 | 能力 | 样式选项 |
|------|------|----------|
| `to-docx` | Markdown → Word（CLI，支持单文件 / 多文件 / 目录批量） | `tech`（深蓝网格表，默认）/ `paper`（三线表）；两者页面/字体/公式编号/图名一致，仅表格样式不同 |
| GUI 第一行 | MD→Word / MD→论文版（两按钮，样式由功能决定，无独立样式框） | 各自固定 |

## 论文模式（paper）

依据 `docs/资料/格式模板/02-论文格式与结构规范.docx`、`03-论文排版与参考文献规范.docx`（科创比赛论文规范，由原「论文 文档格式 2019-10-23.doc」拆分而来）实现，适用于 `to-docx --style paper` 与 GUI「MD→论文版」按钮。

> ⚠️ **tech 与 paper 共用同一套 `_apply_shared_style`**：下方「页面 / 字体 / 公式 / 图名」规则**两者完全相同**，并非 paper 独有。两种模式的**唯一区别就是表格样式**（见「表格」项）。

- **页面**（tech 与 paper 一致）：A4（21×29.7cm）+ 上/下 1in、左/右 1.25in 页边距 + 页脚居中页码
- **字体**（tech 与 paper 一致）：正文宋体、小四号、1.5 倍行距；标题黑体（题目黑体小三居中）
- **表格**（⚠️ 两者唯一区别）：
  - paper（论文版）= 三线表（仅顶线/栏目线/底线，无竖线、无内部横线），表头黑体不加填充
  - tech（默认）= 深蓝网格表（表头 `#2E5A9C` 填充 + 白字加粗 + 灰色全网格线）
- **公式**：LaTeX → Word 原生 OMML（可编辑，独立成行）；自动编号——把公式从块级 `oMathPara` 就地改为行内 `oMath`（移动节点、不深拷贝），用「居中 tab + 右对齐 tab」让 `(n)` 显示在公式**同行右侧**（零依赖后处理，不移动 OMML 故不会渲染空白框）。
  - ⚠️ 源 md 里的 `\tag{...}`/`\label{...}` 是 pandoc texmath **不支持**的命令，会导致整块 `$$...$$` 被降级为纯文本（表现：公式和编号都没有）。`preprocess_md` 会先剔除这些命令（源文件不动），编号交给自动编号。若发现公式变纯文本，先查 `$$` 块里是否有 `\tag`。
- **上标 / 下标（如正文引用编号 `<sup>[3,5]</sup>`）**：`preprocess_md` 自动把 `<sup>x</sup>`→pandoc 原生 `^x^`、`<sub>x</sub>`→`~x~`（内容裸空格转义为 `\ `）。原因：pandoc 的 markdown reader 把 `<sup>` 当 raw_html 内联，docx writer 会**直接丢弃**（只剩纯文字、上标失效）；转成原生语法后 docx 才渲染真正的上标。**同时 pandoc `-f` 必须带 `-inline_notes`**（本 skill 已设 `markdown-citations-inline_notes+tex_math_dollars`），否则 `^[3,5]^` 会被 `inline_notes` 扩展误判为内联脚注（`^[...]`=脚注）。校验：`word/document.xml` 中 `superscript` 出现次数应等于插入的上标数。md 源保持 `<sup>` 写法即可（GitHub 可渲染），转换管道自动处理。
- **图/表名**：表名在表格正上方、图名在图片正下方（pandoc 默认行为）
- **合规提醒**：转换后日志输出检查清单（无封面、无任何人名/照片/鸣谢；参考文献≥6篇且英文≥2、网页/报刊不可列入）

> 技术文档模式（`tech`，默认）保持原项目样式：深蓝表头 `#2E5A9C` + 白字加粗 + 灰色细边框，页面与论文版一致（A4 + 页码），两者差异仅在表格表头。

## 使用方式

### 双击运行（GUI）

双击 `docx-toolkit.pyw` → 弹出集成窗口：

- **第一行单选功能**：MD→Word / MD→论文版（样式由所选功能决定，无独立样式框）
- 勾选「批量模式」后，输入路径选目录，对整个目录下所有 `.md` 批量转换（与第一行复选）；**自动跳过 `研究日志.md`**，它必须由 research-log-docx skill 单独转换（否则生成错误文档）
- 单文件模式若误选 `研究日志.md`，会提示「请改用 research-log-docx skill」并中止，不会生成错误文档
- 选择输入/输出路径 → 点「开始转换」

### 命令行

```powershell
# MD -> Word（技术文档，默认）
pythonw E:\sEMG_B_Project\skills\docx-toolkit\docx-toolkit.pyw to-docx 输入.md -o 输出.docx

# MD -> Word（论文格式）
pythonw ...\docx-toolkit.pyw to-docx 输入.md -o 输出.docx --style paper

# 批量：多文件 / 目录 / 通配（-o 此时为“输出目录”，逐个派生同名 .docx）
pythonw ...\docx-toolkit.pyw to-docx a.md b.md -o 输出目录\
pythonw ...\docx-toolkit.pyw to-docx docs\ -o 输出目录\ --style paper   # 目录只扫单层 *.md、不递归，且自动跳过「研究日志*.md」（由 research-log-docx skill 处理）
pythonw ...\docx-toolkit.pyw to-docx "docs\*.md" -o 输出目录\
```

> 规则：`input` 支持一个或多个「文件 / 目录 / glob 通配」。**仅当输入解析为单个文件且 `-o` 不是目录时**，`-o` 才被当作输出 .docx 路径（保持旧行为）；其余情况 `-o` 一律视为输出目录，输出名由输入文件名派生（paper 加 `_论文版`）。目录批量与 GUI 一致，只扫单层不递归子目录。

## 依赖（用户机器已就绪）

- pandoc ≥ 3.0（已装，PATH 中）
- python-docx ≥ 1.0、python-pptx ≥ 1.0（已装）

## 图片自包含说明

Markdown 源文件中的图片均以 base64 `data:` URI **内联**（不引用外部 `images/` 目录）。pandoc 转换时自动嵌入 docx，生成的 Word 完全自包含、可独立分发，仅需 md 源文件即可复现。

## 与 md-table-align 的配合

`md-table-align` skill **保持独立**（它按显示宽度对齐 Markdown 源文件里的表格/盒子绘图，属上游预处理，且与 `stock-daily-brief` skill 同源维护）。建议：在运行 `to-docx` 之前，先跑一次 `md-table-align` 对齐源 md，可保证转换后 Word 里表格竖线视觉整齐。

## 结构 / 来源

本 skill 当前为**单文件实现**：所有功能内联在 `docx-toolkit.pyw` 一个文件中（GUI + CLI + 转换引擎），`docx-toolkit/` 目录下仅 `SKILL.md` 与 `docx-toolkit.pyw` 两个文件。

- `md-to-docx`（to-docx 双样式 + 表格/公式样式）原始 skill 的能力已合并进 `docx-toolkit.pyw` 单一文件
- 共享工具函数（`find_pandoc` / `set_cell_shading` / `set_cell_border` / `_apply_grid_widths` / `style_tables`）仅保留一份

> 历史上本 skill 还包含 PPT 转换、docx→PDF、Word→MD、目录打包、批量互转、文档配图等扩展模块（`ppt_mod.py` / `docx_io_mod.py` / `gen_img_mod.py` / `md_to_docx_mod.py` / `defense_mod.py` 及 `reference.docx` 等）。经聚焦精简，当前 skill 仅保留与「Markdown → Word」直接相关的能力，上述扩展模块已移除，CLI 也只保留 `to-docx` 一个子命令，且全部代码收敛到单个 `docx-toolkit.pyw`。
