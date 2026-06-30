---
name: git-push
description: sEMG项目Git提交推送工具（GUI版本）。当用户说"提交代码"/"推送代码"/"git push"/"保存代码"/"提交到GitHub"时，启动GUI窗口执行完整流程（设置代理→检测变更→add→commit→push→清除代理）。触发后自动弹出"sEMG Git Push Tool"窗口，无需手动操作。
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
3. **设置代理** — 设置 `http://shproxy.asrmicro.com:80`（公司网络需要）
4. **提交代码** — `git add -A` + 自动生成 commit 消息（时间戳）
5. **推送远程** — `git push origin main`
6. **显示错误详情** — 如果推送失败，逐行显示 git 实际错误信息（如 `non-fast-forward`）
7. **清除代理** — 推送完成后清除代理设置

GUI 特点：
- 深色终端风格界面
- 实时显示 Git 操作日志
- 自动保存日志到 `E:\sEMG_B_Project\logs\git\git_push_YYYYMMDD_HHMMSS.txt`
- 可点击 [Open Logs] 按钮打开日志文件夹

---

## 使用方式

### 方式一：指令触发（推荐）

在 OpenClaw 中说：
- "提交代码"
- "推送代码"
- "git push"

→ AI 自动启动 GUI 窗口。

### 方式二：双击文件

```powershell
双击 E:\skills\git-push\git_push.pyw
```

---

## 两种模式

```powershell
# GUI 模式（默认，无控制台窗口）
pythonw "E:\skills\git-push\git_push.pyw"

# CLI 模式（命令行输出）
python "E:\skills\git-push\git_push.pyw" --cli

# 指定项目目录
pythonw "E:\skills\git-push\git_push.pyw" E:\sEMG_C_Project
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
pythonw "E:\skills\git-push\git_push.pyw"
```

---

## 推送失败错误处理

`git_push()` 返回 `(success, err_msg)`，GUI/CLI 会自动显示 git 的错误信息。

常见推送失败原因：

| 错误 | 原因 | 解决 |
|------|------|------|
| `non-fast-forward` | 本地落后远程 | 先 `git pull --rebase` 或 `git push --force`（见下方说明） |
| `could not read Username` | 认证失败 | 检查 GitHub token 或 SSH 密钥 |
| `Connection refused` / `timeout` | 代理/网络问题 | 检查代理设置 `http://shproxy.asrmicro.com:80` |

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

| 配置项 | 值 |
|--------|-----|
| 项目目录 | `E:\sEMG_B_Project` |
| Git 可执行文件 | `C:\Git\cmd\git.exe` |
| 代理 | `http://shproxy.asrmicro.com:80` |
| 远程 | `origin` |
| 分支 | `main` |
| 日志目录 | `E:\sEMG_B_Project\logs\git` |
| 日志文件格式 | `git_push_YYYYMMDD_HHMMSS.txt` |

---

## 常见问题

### 推送失败（代理问题）

公司网络需要代理访问 GitHub。Skill 会自动设置代理，推送完成后清除。

如果推送失败，可以手动设置代理：
```powershell
git config --global http.proxy http://shproxy.asrmicro.com:80
git push origin main
git config --global --unset http.proxy
```

### 没有变更

如果项目目录没有 Git 变更，GUI 会显示 "No changes detected"，不会执行提交。

---

## 相关文档

- **Skill 体系概览：** [`../README.md`](../README.md)
- **固件上传工具：** [`../firmware-upload/SKILL.md`](../firmware-upload/SKILL.md)
- **组合工作流：** [`../workflow/SKILL.md`](../workflow/SKILL.md)
