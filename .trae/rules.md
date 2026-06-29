# sEMG 项目文件组织规则

> 版本：v1.0 | 生效：2026-06-29
> 本文件是项目规则的**唯一权威源**。
> 所有 AI Agent 在创建或移动文件时，必须遵循以下规则。

---

## 目录层级

```
E:\
├── sEMG_B_Project\    ← 项目源码（只放核心代码）
├── docs\              ← 项目文档（统一管理）
├── skills\            ← 功能脚本（复用 Skill）
└── logs\              ← 运行日志（自动生成）
```

---

## 共享资源

以下资源对所有 AI Agent（QClaw / TRAE / WorkBuddy）共享，任何 Agent 都可以读取、修改和调用：

| 资源 | 路径 | 说明 |
|------|------|------|
| **规则文件** | `rules.md` | 单一权威源，三个 Agent 都可修改并同步 |
| **Skill 脚本** | `E:\skills\` | 共享工具，三个 Agent 都可调用和修改 |
| **日志目录** | `E:\logs\` | 共享日志，三个 Agent 都可写入 |
| **文档目录** | `E:\docs\` | 共享文档，三个 Agent 都可读写 |

---

## 规则一：项目源码 `E:\sEMG_B_Project\`

只放核心代码，不放零散文件。

### 允许的子目录

| 目录 | 用途 | 说明 |
|------|------|------|
| `firmware/` | PlatformIO 固件源码 | 唯一入口 |
| `mini_program/` | 微信小程序源码 | 唯一入口 |
| `scripts/` | 一次性开发辅助脚本 | 已 .gitignore |

### 禁止事项

- ❌ 根目录禁止放 `.py` / `.pyw` / `.js` → 放到 `scripts/` 或 `skills/`
- ❌ 根目录禁止放 `.md` 文件 → 放到 `E:\docs\`
- ❌ 禁止在 `firmware/`、`mini_program/` 内部创建独立 `.gitignore` → 统一用根的 `.gitignore`
- ❌ 禁止提交 `node_modules` / `.pio/` / `__pycache__`

### Git 准则

- 只有根目录一个 `.gitignore`，统一管理所有忽略规则
- `scripts/` 已在 `.gitignore`，不影响 git
- 临时脚本完成后不需要 git add
- 提交信息格式：`type: description`

---

## 规则二：文档 `E:\docs\`

所有文档统一放这里。

### 文档版本管理

```
E:\docs\
├── 硬件说明.md              ← 最新版（无版本号后缀）
├── 固件与小程序架构.md
├── 小程序页面设计.md
├── 肌电算法说明.md
├── 云开发环境指南.md
├── archive\                  ← 历史版本归档
│   ├── 硬件说明文档_v1.4_20260623.md
│   └── ...
└── spec\                     ← 规格书
```

### 更新流程（必须按顺序）

1. 将 `E:\docs\` 下的旧版移到 `archive\`（加版本号和日期后缀）
2. 写入新版到 `E:\docs\`（无版本号后缀）
3. `E:\docs\` 下始终只保留最新版

### 命名规则

- 当前版：`文档名.md`
- 归档版：`文档名_v版本_日期.md`

---

## 规则三：共享技能脚本 `E:\skills\`

**`E:\skills\` 是三个 AI Agent（QClaw / TRAE / WorkBuddy）的共享工具目录，任何 Agent 都可以读取、修改和调用。**

### 目录结构

```
E:\skills\
firmware-upload/
├── firmware_upload.pyw      ← 主脚本（无控制台窗口）
└── SKILL.md                 ← 触发词 + 功能说明
workflow/
├── workflow.pyw
└── SKILL.md
```

### 共享规则

- **所有 AI Agent 共享**：`E:\skills\` 下的 skill 脚本对 QClaw、TRAE、WorkBuddy 都可访问
- **修改同步**：修改 skill 脚本后，其他 AI Agent 立即可用最新版本
- **不依赖项目路径**：skill 脚本通过 CLI 参数传入项目路径，不硬编码
- **调用方式**：三个 AI Agent 都使用相同命令调用 skill

### 规范

- 所有脚本用 `.pyw` 扩展名
- 支持 GUI + CLI 双模式（默认 GUI，`--cli` 切换命令行）
- 必须有 `kill_previous()` 防止旧进程堆积
- SKILL.md 内容必须与实际代码功能一致
- `E:\skills\` 不是 git 仓库，不需要 `.gitignore`

---

## 规则四：运行日志 `E:\logs\`

### 目录结构

```
E:\logs\
├── serial\             ← 固件串口日志：serial_log_YYYYMMDD_HHMMSS.txt
├── mini\               ← 小程序日志：mini_log_YYYYMMDD_HHMMSS.txt
├── git\                ← Git 操作日志
├── analyze\            ← 日志分析结果
└── cloudfunction\      ← 云函数部署日志
```

### 命名规则

- `类目_log_YYYYMMDD_HHMMSS.txt` — 每次启动独立文件
- 按文件名末尾时间戳排序即可找到最新日志

---

## 规则五：.gitignore 管理

- 只有根目录一个 `.gitignore`，禁止子目录创建独立 `.gitignore`
- 已覆盖的规则（无需重复添加）：
  - `.pio/`、`firmware/.pio/`
  - `node_modules/`
  - `__pycache__/`、`*.pyc`
  - `scripts/`
  - `logs/`
  - `.vscode/`、`.idea/`

---

## AI Agent 工作禁忌

- ❌ 不要在 `sEMG_B_Project\` 根目录创建任何 `.md` / `.py` / `.js` 文件
- ❌ 不要改动 `E:\skills\` 中的 Python 脚本（skill 脚本，已稳定）
- ❌ 不要随意写入 `E:\logs\`（由 skill 驱动）

- ❌ 不要在文档或注释中使用 emoji（PowerShell 终端显示为乱码，且一些 AI Agent 转译会破坏 UTF-8 编码）
- ❌ 批量文件操作优先使用 edit 工具，避免用 PowerShell 做字符串替换（管道会损坏 UTF-8 中文）

---

## Skill 调用指引

> `E:\skills\` 是独立于项目的工具脚本集，通过 CLI 参数传递项目路径。
> 调用时始终使用 `pythonw`（无控制台窗口），如需日志输出用 `--cli` 模式。

### 通用调用格式

```powershell
pythonw E:\skills\<skill>\<script>.pyw [项目路径参数] [--cli]
```

### 各 Skill 调用命令

| 操作 | 命令 | 参数说明 |
|------|------|---------|
| 完整部署 | `pythonw E:\skills\workflow\workflow.pyw --cli E:\sEMG_B_Project\firmware E:\sEMG_B_Project\mini_program` | 先上传固件→10秒→编译小程序 |
| 上传固件 | `pythonw E:\skills\firmware-upload\firmware_upload.pyw --cli E:\sEMG_B_Project\firmware` | 编译+上传+串口监控GUI |
| 编译小程序 | `pythonw E:\skills\miniprogram-upload\miniprogram_upload.pyw --cli E:\sEMG_B_Project\mini_program` | 编译+预览码+日志服务GUI |
| Git推送 | `pythonw E:\skills\git-push\git_push.pyw --cli E:\sEMG_B_Project` | 自动 add→commit→push |
| 分析日志 | `pythonw E:\skills\log-analyze\log_analyze.pyw --cli <firmware/mini_program>` | 分析最新日志 |
| 部署云函数 | `pythonw E:\skills\cloudfunction-deploy\cloudfunction_deploy.pyw --cli E:\sEMG_B_Project\mini_program\cloudfunctions` | 一键部署云函数 |

### Skill 调用原则

1. **优先用 workflow** — "上传并编译" 一件事用 `workflow.pyw` 完成
2. **需要日志输出时加 `--cli`** — 不加 `--cli` 会启动 GUI 窗口
3. **不要手动去读 E:\logs\ 的原始日志文件** — 用 `log-analyze` 或 `workflow analyze`
4. **不要直接调 pio.exe / cli.bat** — 都用 skill 脚本封装好的

---

## Skill 运行后的自动分析

当 firmware-upload 或 miniprogram-upload 运行完成后，AI Agent 应主动询问用户：

> "是否需要分析日志？"

用户说"分析"时，AI Agent 应：

1. 读取对应的日志目录：
   - 固件日志：`E:\logs\serial\`
   - 小程序日志：`E:\logs\mini\`
2. 读取最新生成的日志文件
3. 输出完整的分析报告（包含所有发现的异常）
4. 告知用户发现了哪些问题，供进一步讨论

**注意**：不需要单独调用 log-analyze skill，AI 直接读取日志文件分析。

---

## 规则同步机制

### 权威源

`E:\sEMG_B_Project\rules.md` 是项目规则的**唯一权威源**。

### 同步规则

修改 `rules.md` 后，必须立即同步到各 AI Agent 的配置文件：

```powershell
$src = "E:\sEMG_B_Project\rules.md"
# 同步到 QClaw
Copy-Item $src "C:\Users\honghuang\.qclaw\workspace\AGENTS.md" -Force
# 同步到 TRAE
Copy-Item $src "E:\sEMG_B_Project\.trae\rules.md" -Force
# 同步到 WorkBuddy
Copy-Item $src "E:\sEMG_B_Project\.workbuddy\rules.md" -Force
```

### 各工具配置文件

| 工具 | 配置文件 |
|------|----------|
| QClaw | `C:\Users\honghuang\.qclaw\workspace\AGENTS.md` |
| TRAE | `E:\sEMG_B_Project\.trae\rules.md` |
| WorkBuddy | `E:\sEMG_B_Project\.workbuddy\rules.md` |

---

## 规则六：文件编码规范

### 核心事实

本项目所有源码文件（`firmware/*.cpp/*.h`、`mini_program/*.js`、`*.md`）均为 **UTF-8 + BOM（EF BB BF）** 编码。**没有任何文件是 GBK / ANSI / CodePage 936。**

### 铁律

1. **永远不要用 GBK 读/写本项目文件**
   - ❌ `[System.Text.Encoding]::GetEncoding(936)` — 这是乱码根因
   - ✅ 一律用 `[System.Text.Encoding]::UTF8`

2. **优先用 edit / write 工具做文件修改**
   - `edit` 工具自动处理编码，不会损坏中文
   - `write` 工具新建文件默认 UTF-8
   - 最后选：PowerShell 原生 .NET 方法（显式指定 UTF8）

3. **PowerShell 安全操作用法**
   ```powershell
   # ✅ 安全读写
   $lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
   [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
   
   # ❌ 禁止 — 不指定编码会走系统 ANSI (GBK)
   Get-Content $path; Set-Content $path $content
   ```

### 误操作恢复

```
git checkout -- <文件>   # 从 git 恢复原始 UTF-8 版本
```

然后重新编辑，但改用 `edit` 工具而非 PowerShell。

### 常见陷阱

| 场景 | 问题 | 正确做法 |
|------|------|----------|
| PowerShell `-replace` 替换中文 | GBK 终端截断多字节 UTF-8 | 用 `edit` 工具 |
| `Select-String` 搜索中文 | 管道输出丢失 UTF-8 字节 | 用 `[IO.File]::ReadAllLines()` + UTF8 |
| `git show` 通过管道查看 | PowerShell 解码 stdout 成 GBK | `git checkout` 写磁盘后用 `read` 看 |
| `Start-Process` 子进程输出 | stdout 编码随终端 | 避免用子进程输出写文件 |
| 批量替换版本标签 | PowerShell string 操作对多字节不友好 | 用 `edit` 逐文件处理 |

## 违规处理

发现违反规则的提交或新增文件：

1. **零散 .py/.js** → 移到 `scripts/` 或 `skills/`
2. **零散 .md** → 移到 `docs/`
3. **子目录 .gitignore** → 合并到根目录后删除
4. **垃圾目录**（`__pycache__`、`node_modules` 等）→ 直接删除
5. **文件编码损坏** → 先用 `git checkout` 恢复，再重新编辑
