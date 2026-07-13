---
name: docx-utils
description: "docx 与 Markdown 双向互转 / 生成正式报告 / 批量目录互转 / docx 转 PDF / 目录文档打包成带封面报告。通用工具, 不绑定具体项目。触发词: '转成 docx'、'docx 转 markdown'、'md 转 docx'、'生成报告'、'导出 word'、'docx 互转'、'批量转 docx'、'docx 转 pdf'、'打包文档成报告'、'把 markdown 变成 word'。依赖 pandoc(已装) 与 python-docx(已装); docx 转 PDF 需 LibreOffice(可选)。支持 GUI(双击) 与 CLI(指令) 双模式。"
license: Proprietary.
---

# docx-utils: 文档转换通用工具

路径: `E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw`
通用, 不绑定任何项目。基于 pandoc + python-docx, docx->PDF 需 LibreOffice。

## 双模式
- **双击** `docx_utils.pyw` 或无参数 -> GUI 模式 (文件/文件夹选择, 日志窗口)
- **指令模式** -> 加 `--cli` 或直接以子命令开头

## 依赖(已就绪)
- pandoc 3.10 (在 `C:\Users\honghuang\bin`, 已写入用户 PATH)
- python-docx 1.2.0
- LibreOffice (仅 docx2pdf / package 可选; 未装时 docx2pdf 会提示 `winget install TheDocumentFoundation.LibreOffice`)

## 子命令
1. `to-docx 输入.md -o 输出.docx [--toc]` — Markdown -> docx
2. `to-md 输入.docx -o 输出.md` — docx -> Markdown
3. `gen-report 输入.md -o 报告.docx --title T --author A --date D [--no-pagenum]` — 正式报告(目录+样式+页码)
4. `batch --dir 目录 --mode md2docx|docx2md [--recursive] [-o 输出目录]` — 目录批量互转(自动跳过 archive 子目录)
5. `docx2pdf 输入.docx或目录 [-o 输出目录] [--install]` — docx -> PDF (LibreOffice)
6. `package --dir 目录 -o 报告.docx --title T --author A --date D [--recursive] [--order f1.md,f2.md]` — 目录内 Markdown 打包成带封面+目录+页码的正式报告

## CLI 示例
```powershell
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli to-docx readme.md -o readme.docx --toc
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli to-md report.docx -o report.md
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli gen-report input.md -o report.docx --title "测试报告" --author "张三" --date "2026-07-13"
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli batch --dir .\docs --mode md2docx --recursive -o .\out
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli docx2pdf report.docx
pythonw E:\sEMG_B_Project\skills\docx-utils\docx_utils.pyw --cli package --dir .\docs -o 项目报告.docx --title "项目报告" --author "团队" --date "2026-07-13"
```
(子命令直接开头也会进入 CLI, 无需 `--cli`)

## 通用性说明
- 所有路径均由参数传入, 不硬编码任何项目目录。
- 样式模板 `reference.docx` 首次运行自动生成在同目录(中文友好, Microsoft YaHei)。

## 注意事项
- 报告/打包的目录(TOC)是 Word 域, 首次用 Word 打开会提示更新域, 点"是"。
- 复杂 docx(文本框/浮动图/修订痕迹)转 Markdown 会有信息损失, 属 pandoc 固有限制。
- 模板字体 Microsoft YaHei 为 Windows 自带; 非 Windows 打开回退系统字体。
- `package` 默认按文件名字母序合并; 用 `--order` 指定顺序, 自动跳过 archive 子目录。
