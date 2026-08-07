---
name: git-push
description: sEMG项目Git提交推送工具（GUI版本）。当用户说"提交代码"/"推送代码"/"git push"/"保存代码"/"提交到GitHub"时，启动GUI窗口执行完整流程（网络自适应→检测变更→add→commit→push→清理网络）。触发后自动弹出"sEMG Git Push Tool"窗口，无需手动操作。
---

# git-push

sEMG 项目 Git 提交推送工具（GUI + CLI 双模式）。

---

## 触发词

- "提交代码"
- "推送代码"
- "git push"
- "保存代码"
- "提交到GitHub"
- "git commit"

---

## 功能说明

触发后自动弹出 GUI 窗口，执行完整流水线：

1. **检测变更** — 检查 `E:\sEMG_B_Project` 的 Git 状态，列出变更文件
2. **显示仓库地址** — 显示远端仓库 URL
3. **网络自适应** — 自动检测公司代理 `http://shproxy.asrmicro.com:80` 是否可达：可达则走代理推送；不可达（如家庭/外网）则直接推送，无需代理
4. **提交代码** — `git add -A` + 自动生成 commit 消息（时间戳）
5. **推送远程** — `git push origin main`
6. **显示错误详情** — 如果推送失败，逐行显示 git 实际错误信息（如 `non-fast-forward`）
7. **清理网络** — 推送完成后清理代理环境变量（不再改动全局 git 配置，避免崩溃后代理泄漏污染本机其它仓库）

GUI 特点：
- 深色终端风格界面
- 实时显示 Git 操作日志
- 自动保存日志到 `E:\sEMG_B_Project\logs\git\git_push_YYYYMMDD_HHMMSS.txt`
- 可点击 [Open Logs] 按钮打开日志文件夹

---

## 使用方式

### 方式一：指令触发（推荐）

在 AI Agent（QClaw / TRAE / WorkBuddy）中说：
- "提交代码"
- "推送代码"
- "git push"

→ AI 自动启动 GUI 窗口。

### 方式二：双击文件

```powershell
双击 E:\sEMG_B_Project\skills\git-push\git_push.pyw
```

### 方式三：回溯补日志（手动 git 后补救）

如果之前绕过了 skill 直接用命令行执行了 git commit/push，可以用此方式补生成日志：

```powershell
# 为最近一次 commit 补日志
python "E:\sEMG_B_Project\skills\git-push\git_push.pyw" --retroactive

# 为指定 commit 补日志（支持 HEAD / commit hash / tag）
python "E:\sEMG_B_Project\skills\git-push\git_push.pyw" --retroactive 87d2669
```

> **重要**：AI Agent 在执行手动 git 操作后，应自动调用此命令补日志，确保 `logs/git/` 日志完整。

---

## 两种模式

```powershell
# GUI 模式（默认，无控制台窗口）
pythonw "E:\sEMG_B_Project\skills\git-push\git_push.pyw"

# CLI 模式（命令行输出）
python "E:\sEMG_B_Project\skills\git-push\git_push.pyw" --cli

# 回溯补日志模式（为已有 commit 生成日志文件）
python "E:\sEMG_B_Project\skills\git-push\git_push.pyw" --retroactive [commit_ref]

# 指定项目目录
pythonw "E:\sEMG_B_Project\skills\git-push\git_push.pyw" E:\sEMG_B_Project
```

无 `-m` / `--dry-run` 参数支持（提交消息自动生成时间戳）。

---

## AI 执行逻辑

当识别到触发词时，执行：

```powershell
# 杀掉所有旧的 git_push.pyw 进程
$procs = Get-CimInstance Win32_Process -Filter "Name like 'pythonw%.exe'"
foreach ($p in $procs) {
    if ($p.ProcessId -ne $PID -and $p.CommandLine -like '*git_push.pyw*') {
        Stop-Process -Id $p.ProcessId -Force
    }
}
Start-Sleep -Seconds 1

# 启动新的 GUI
pythonw "E:\sEMG_B_Project\skills\git-push\git_push.pyw"
```

---

## 推送失败错误处理

`git_push()` 返回 `(success, err_msg)`，GUI/CLI 会自动显示 git 的错误信息。

常见推送失败原因：

| 错误                             | 原因          | 解决                                                       |
| -------------------------------- | ------------- | ---------------------------------------------------------- |
| `non-fast-forward`               | 本地落后远程  | 先 `git pull --rebase` 或 `git push --force`（见下方说明） |
| `could not read Username`        | 认证失败      | 检查 GitHub token 或 SSH 密钥                              |
| `Connection refused` / `timeout` | 代理/网络问题 | 检查代理设置 `http://shproxy.asrmicro.com:80`              |

**如何处理 `non-fast-forward`：**

选项 A（推荐，用本地覆盖远程）：
```powershell
git push --force origin main
```

选项 B（合并远程变更）：
```powershell
git pull --rebase origin main
git push origin main
```

**注意**：`--force` 会覆盖远程历史，适合个人项目。多人协作项目请用 `--rebase`。

---

## 路径配置

| 配置项         | 值                               |
| -------------- | -------------------------------- |
| 项目目录       | `E:\sEMG_B_Project`              |
| Git 可执行文件 | 自动探测（见下方「Git 路径解析」）：`C:\Program Files\Git` → `C:\Program Files (x86)\Git` → `%LOCALAPPDATA%\Git`（用户目录独立安装，无需管理员）→ `C:\Git`（GitHubDesktop junction）→ PATH |
| 代理           | `http://shproxy.asrmicro.com:80` |
| 远程           | `origin`                         |
| 分支           | `main`                           |
| 日志目录       | `E:\sEMG_B_Project\logs\git`     |
| 日志文件格式   | `git_push_YYYYMMDD_HHMMSS.txt`   |

---

## 常见问题

### 日志中中文文件名显示为乱码（`\345\237\272` 这种）

这是 Git 对非 ASCII 路径的八进制转义输出。skill 已内置自动解码（`core.quotepath=false` + 后处理解码器），正常 GUI/CLI 模式下不再出现此问题。

如果看到旧日志有乱码，可用 `--retroactive` 重新生成一份干净的：

```powershell
python "E:\sEMG_B_Project\skills\git-push\git_push.pyw" --retroactive
```

### 不在公司网络时需要代理吗？

不需要。Skill 会自动检测公司代理主机 `shproxy.asrmicro.com:80` 是否可达：

- **在公司网络（代理可达）**：自动走代理推送。
- **不在公司网络（代理不可达，如家里/外网）**：自动改为直连推送，不设置任何代理。

如果首选模式失败，Skill 会自动在两种模式间重试（代理失败则试直连，反之亦然），并把实际使用的模式写入日志（`Push SUCCESS! (via proxy/direct ...)`）。

### 推送失败（网络/代理问题）

- Skill **不再修改**全局 `git config --global http.proxy`（旧版会，若中途崩溃可能残留、影响本机其它仓库）。现在仅对当次 `git push` 子进程注入 `http_proxy`/`https_proxy` 环境变量，推送结束即清理，不会污染其它仓库。
- 启动时会自动清理上一次崩溃可能残留的、指向本公司代理的全局配置（只清我们自己的，不动你其它代理配置）。
- 若仍失败，可按上方「推送失败错误处理」表格按错误类型排查。必要时手动临时设置代理：
```powershell
git config --global http.proxy http://shproxy.asrmicro.com:80
git push origin main
git config --global --unset http.proxy
```

### 没有变更

如果项目目录没有 Git 变更，GUI 会显示 "No changes detected"，不会执行提交。

---

### Git 路径解析（为什么不直接写死 `C:\Git`）

`GIT_EXE` 由 `_resolve_git_exe()` 在启动时自动探测，优先级如下：

1. `C:\Program Files\Git\cmd\git.exe` — 独立 **Git for Windows** 安装（管理员安装，推荐，不受 GitHub Desktop 升级影响）
2. `C:\Program Files (x86)\Git\cmd\git.exe` — 32 位独立安装
3. `%LOCALAPPDATA%\Git\cmd\git.exe` — 非管理员装到用户目录的独立 Git（如 `C:\Users\<用户>\AppData\Local\Git`，推荐，无需管理员、不受影响 GitHub Desktop 升级影响）
4. `C:\Git\cmd\git.exe` — GitHub Desktop 创建的 *Junction*（见下方悬空风险）
5. PATH 中的 `git`

启动时日志会打印一行 `Git: <路径> (resolves to: <真实路径>)`，可用来确认当前用的是哪个 git、以及符号链接指向哪。

### git.exe 启动崩溃（0xc0000142 / "应用程序无法正常启动"）

报错形如弹窗「应用程序无法正常启动 (0xc0000142)」或日志里 `git.exe 启动失败（... 疑似 0xc0000142 ...）`。两类根因：

**① 第三方杀毒软件拦截 git.exe（最常见）**
本机 Windows Defender 实时防护未运行（由第三方杀软接管），可能把 `git.exe`（尤其经 pythonw 无控制台拉起时）误判并阻断，导致 DLL 初始化失败。
**解决**：把 git.exe 的真实路径加入杀软白名单。先读日志 `Git: ...` 一行确认真实路径（已穿透符号链接显示），例如当前为：
`C:\Users\honghuang\AppData\Local\GitHubDesktop\app-3.5.12\resources\app\git\cmd\git.exe`。
建议把整目录 `C:\Users\honghuang\AppData\Local\GitHubDesktop\` 加白名单（版本号会变，加整目录更稳）；或干脆装独立 Git for Windows（见下，装好后路径变 `C:\Program Files\Git`，自然脱离 GitHubDesktop 目录）。

**② `C:\Git` 符号链接悬空**
`C:\Git` 是 GitHub Desktop 创建的 *Junction*，指向 `...\GitHubDesktop\app-<版本号>\...\git`。GitHub Desktop 自动升级后版本号路径改变，Junction 悬空，`C:\Git\cmd\git.exe` 随之失效。日志 `Git: ...` 行会显示 `[WARNING: target missing -> junction is STALE, reinstall Git for Windows or fix C:\Git]`。
**解决**：重装/修复 GitHub Desktop，或安装独立 **Git for Windows**（见下，skill 会自动优先使用 `C:\Program Files\Git`，彻底规避 Junction）。

> 注：本 skill 已用 `CREATE_NO_WINDOW` 规避 pythonw 无控制台拉起 `git.exe` 时 Windows 不给分配控制台导致的崩溃；但杀软拦截或 Junction 悬空仍需按上面处理。

**推荐（一劳永逸）**：安装独立 **Git for Windows**（https://git-scm.com/download/win ，默认装到 `C:\Program Files\Git`）。装好后 skill 启动时按上面的优先级自动选中它，无需改任何配置即可生效，且不再受 GitHub Desktop 升级影响。

---

## 相关文档

- **Skill 体系概览：** [`../README.md`](../README.md)
- **固件上传工具：** [`../firmware-upload/SKILL.md`](../firmware-upload/SKILL.md)
- **组合工作流：** [`../workflow/SKILL.md`](../workflow/SKILL.md)
