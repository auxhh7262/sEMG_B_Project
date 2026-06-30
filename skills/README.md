# sEMG Skill 体系使用指南

> 版本：v1.1 | 更新：2026-06-29
> **所有 AI Agent（QClaw / TRAE / WorkBuddy）共享的技能脚本**

---

## 目录

1. [概述](#概述)
2. [Skill 列表](#skill-列表)
3. [触发词速查表](#触发词速查表)
4. [调用方式](#调用方式)
5. [共享机制](#共享机制)
6. [自动分析流程](#自动分析流程)
7. [项目路径规范](#项目路径规范)
8. [常见问题](#常见问题)
9. [详细文档](#详细文档)

---

## 概述

**E:\sEMG_B_Project\skills** 是 sEMG 项目所有 AI Agent 的共享工具目录，包含 5 个自动化 Skill，覆盖固件上传、小程序编译、云函数部署、Git 推送和组合工作流。

**特性：**
- 所有脚本使用 `.pyw` 扩展名（无控制台窗口）
- 支持 GUI + CLI 双模式
- 启动时自动杀掉旧进程
- 日志自动保存到 `E:\sEMG_B_Project\logs\`

---

## Skill 列表

| Skill | 路径 | 功能 |
|-------|------|------|
| **firmware-upload** | `E:\sEMG_B_Project\skills\firmware-upload\` | 固件编译上传 + 串口监控 |
| **miniprogram-upload** | `E:\sEMG_B_Project\skills\miniprogram-upload\` | 小程序编译 + 日志服务器 |
| **cloudfunction-deploy** | `E:\sEMG_B_Project\skills\cloudfunction-deploy\` | 微信云函数批量部署 |
| **git-push** | `E:\sEMG_B_Project\skills\git-push\` | Git 提交 + 推送 |
| **workflow** | `E:\sEMG_B_Project\skills\workflow\` | 组合工作流（固件→小程序） |

---

## 触发词速查表

| 操作 | 触发词 |
|------|--------|
| 上传固件 | "上传固件" / "编译上传" / "烧录固件" / "刷固件" |
| 编译小程序 | "编译小程序" / "预览小程序" / "上传小程序" |
| 部署云函数 | "部署云函数" / "上传云函数" / "部署 CF" |
| Git 推送 | "提交代码" / "git push" / "推送代码" |
| 一键部署 | "上传并编译" / "一键部署" / "deploy" |
| 分析日志 | "分析" / "分析日志" / "查日志" |

---

## 调用方式

### 通用格式

```powershell
pythonw E:\sEMG_B_Project\skills\<skill-name>\<script>.pyw [参数] [--cli]
```

### 各 Skill 调用命令

| 操作 | 命令 | 参数 |
|------|------|------|
| **上传固件** | `pythonw E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw --cli E:\sEMG_B_Project\firmware` | 固件目录 |
| **编译小程序** | `pythonw E:\sEMG_B_Project\skills\miniprogram-upload\miniprogram_upload.pyw --cli E:\sEMG_B_Project` | 项目目录 |
| **部署云函数** | `pythonw E:\sEMG_B_Project\skills\cloudfunction-deploy\cloudfunction_deploy.pyw --cli E:\sEMG_B_Project\mini_program\cloudfunctions` | 云函数目录 |
| **Git 推送** | `pythonw E:\sEMG_B_Project\skills\git-push\git_push.pyw --cli E:\sEMG_B_Project` | 项目目录 |
| **一键部署** | `pythonw E:\sEMG_B_Project\skills\workflow\workflow.pyw --cli E:\sEMG_B_Project\firmware E:\sEMG_B_Project` | 固件目录 + 项目目录 |

### 两种模式

| 模式 | 命令 | 特征 |
|------|------|------|
| **GUI**（默认） | `pythonw script.pyw` | Tkinter 深色终端界面，实时着色显示 |
| **CLI** | `pythonw script.pyw --cli` | 控制台输出，适合 AI Agent 调用 |

### AI Agent 调用示例

```powershell
# 上传固件（AI Agent 调用）
pythonw E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw --cli E:\sEMG_B_Project\firmware

# 编译小程序（AI Agent 调用）
pythonw E:\sEMG_B_Project\skills\miniprogram-upload\miniprogram_upload.pyw --cli E:\sEMG_B_Project

# 一键部署（AI Agent 调用）
pythonw E:\sEMG_B_Project\skills\workflow\workflow.pyw --cli E:\sEMG_B_Project\firmware E:\sEMG_B_Project
```

---

## 共享机制

### 核心原则

**E:\sEMG_B_Project\skills** 是三个 AI Agent（QClaw / TRAE / WorkBuddy）的共享工具目录：
- **所有 Agent 共享**：`E:\sEMG_B_Project\skills\` 下的 skill 脚本对 QClaw、TRAE、WorkBuddy 都可访问
- **修改同步**：修改 skill 脚本后，其他 AI Agent 立即可用最新版本
- **不依赖项目路径**：skill 脚本通过 CLI 参数传入项目路径，不硬编码

### 规则文件

| AI Agent | 规则文件 | 位置 |
|----------|----------|------|
| QClaw | `AGENTS.md` | `C:\Users\honghuang\.qclaw\workspace\` |
| TRAE | `rules.md` | `E:\sEMG_B_Project\.trae\` |
| WorkBuddy | `rules.md` | `E:\sEMG_B_Project\.workbuddy\` |
| 项目根 | `rules.md` | `E:\sEMG_B_Project\` |

**权威源**：`E:\sEMG_B_Project\rules.md`，修改后需同步到各 Agent。

### 同步命令

```powershell
$src = "E:\sEMG_B_Project\rules.md"
Copy-Item $src "C:\Users\honghuang\.qclaw\workspace\AGENTS.md" -Force
Copy-Item $src "E:\sEMG_B_Project\.trae\rules.md" -Force
Copy-Item $src "E:\sEMG_B_Project\.workbuddy\rules.md" -Force
```

---

## 自动分析流程

### 流程说明

```
用户: "上传固件"
AI: 调用 firmware-upload → 日志保存
AI: 询问 "是否需要分析日志？"

用户: "分析"
AI: 读取最新固件日志
AI: 输出完整分析报告
AI: 告知用户发现的问题
```

### 日志路径

| 日志类型 | 路径 | 文件格式 |
|----------|------|----------|
| 固件日志 | `E:\sEMG_B_Project\logs\serial\` | `serial_log_*.txt` |
| 小程序日志 | `E:\sEMG_B_Project\logs\mini\` | `mini_log_*.txt` |
| 云函数日志 | `E:\sEMG_B_Project\logs\cloudfunction\` | `cloudfunction_deploy_*.txt` |
| Git 日志 | `E:\sEMG_B_Project\logs\git\` | `git_push_*.txt` |

### AI Agent 行为规则

1. **Skill 运行后自动询问**：用户调用 firmware-upload / miniprogram-upload 后，AI Agent 应主动询问"是否需要分析日志？"
2. **用户说"分析"时自动读取**：用户确认后，AI Agent 读取该 Skill 对应的最新日志文件
3. **输出完整分析报告**：包含所有发现的异常（ERROR / WARN），不只是当前问题
4. **分析截止时间**：读取用户说"分析"时已保存的日志内容

---

## 项目路径规范

| 项目 | 路径 |
|------|------|
| **当前项目根** | `E:\sEMG_B_Project\` |
| **固件目录** | `E:\sEMG_B_Project\firmware` |
| **小程序目录** | `E:\sEMG_B_Project\mini_program` |
| **云函数目录** | `E:\sEMG_B_Project\mini_program\cloudfunctions` |
| **Skill 脚本** | `E:\sEMG_B_Project\skills\` |
| **日志目录** | `E:\sEMG_B_Project\logs\` |

### Git 远程仓库

**https://github.com/auxhh7262/sEMG_B_Project.git**

---

## 常见问题

### 固件上传失败（COM4 占用）
Skill 自动杀占用 COM4 的进程（pio.exe / platformio.exe）。

### 串口监控没抓到开机日志
新版本已修复：固件上传完成后立即启动串口监控，板子重启过程中监控已就绪。

### 小程序编译失败（CLI 未找到）
检查 `D:\Program Files\微信web开发者工具\cli.bat` 是否存在。

### 云函数部署失败（未登录）
首次使用需点击 GUI 中的 [Login] 扫码登录。

### Git push 失败
Skill 会自动显示具体的 git 错误信息（如 `non-fast-forward`、认证失败等）。

### 分析日志读不到内容
确保用户已说"分析"，AI Agent 才会读取日志文件。

---

## 详细文档

| Skill | 详细文档 |
|-------|----------|
| firmware-upload | [`firmware-upload/SKILL.md`](firmware-upload/SKILL.md) |
| miniprogram-upload | [`miniprogram-upload/SKILL.md`](miniprogram-upload/SKILL.md) |
| cloudfunction-deploy | [`cloudfunction-deploy/SKILL.md`](cloudfunction-deploy/SKILL.md) |
| git-push | [`git-push/SKILL.md`](git-push/SKILL.md) |
| workflow | [`workflow/SKILL.md`](workflow/SKILL.md) |

---

## 日志目录说明

| 日志目录 | 来源 | 文件格式 |
|----------|------|----------|
| `E:\sEMG_B_Project\logs\serial\` | 固件串口监控 | `serial_log_*.txt` |
| `E:\sEMG_B_Project\logs\mini\` | 小程序日志服务器 | `mini_log_*.txt` |
| `E:\sEMG_B_Project\logs\cloudfunction\` | 云函数部署 | `cloudfunction_deploy_*.txt` |
| `E:\sEMG_B_Project\logs\git\` | Git 推送 | `git_push_*.txt` |

**所有项目共享日志目录**，按时间戳区分日志文件。
