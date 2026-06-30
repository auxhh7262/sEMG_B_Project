---
name: cloudfunction-deploy
description: 微信云函数一键部署工具（使用 tcb CLI）。当用户说"部署云函数"、"上传云函数"、"deploy cloud function"、"发布云端"时触发此skill。自动检测本地云函数目录，通过 tcb CLI 批量部署到微信云开发环境，支持单函数部署和批量部署。
---

# cloudfunction-deploy

微信云函数一键部署工具（GUI版本），基于 **CloudBase CLI (tcb)**。

## 触发词

- "部署云函数"
- "上传云函数"
- "deploy cloud function"
- "发布云端"

## 功能说明

触发后自动弹出 GUI 窗口，支持：
1. **扫码登录** - 首次使用点击 [Login] 扫码登录微信云开发
2. **环境/函数列表** - 查看云环境和云端云函数列表
3. **批量部署** - 一键部署所有本地云函数
4. **单函数部署** - 选中指定函数部署
5. **日志记录** - 自动保存部署日志

GUI 特点：
- 深色终端风格界面
- 实时显示部署日志（绿色=成功、黄色=警告、红色=错误、浅蓝=信息）
- 自动保存日志到 `E:\sEMG_B_Project\logs\cloudfunction\cloudfunction_deploy_YYYYMMDD_HHMMSS.txt`
- 可点击按钮打开日志文件夹

## 使用方式

### 方式一：指令触发（推荐）

在 OpenClaw 中说：
- "部署云函数"
- "上传云函数"

→ AI 自动杀掉旧进程，然后启动 GUI 窗口。

### 方式二：双击文件

双击 `cloudfunction_deploy.pyw` 文件：
```
E:\skills\cloudfunction-deploy\cloudfunction_deploy.pyw
```

→ 弹出 GUI 窗口（无黑色控制台窗口）。

## AI 执行逻辑

当识别到触发词时，执行：

```powershell
# 1. 杀掉所有旧的 cloudfunction_deploy.pyw 进程（python.exe 和 pythonw.exe）
$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%.exe'"
foreach ($p in $procs) {
    if ($p.ProcessId -ne $PID -and $p.CommandLine -like '*cloudfunction_deploy.pyw*') {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "Killed old process: $($p.ProcessId)"
    }
}
Start-Sleep -Seconds 1

# 2. 启动新的 GUI
pythonw "E:\skills\cloudfunction-deploy\cloudfunction_deploy.pyw"
```

**注意**：
- 使用 `pythonw.exe`（不是 `python.exe`），避免弹出黑色控制台窗口
- 先杀旧进程，再启动新 GUI，确保只有一个窗口
- 首次使用需要在 GUI 中点击 [Login] 扫码登录，后续自动保留登录态
- 部署需要 `cloudbaserc.json` 配置文件（位于云函数根目录），避免交互式菜单

## 文件说明

| 文件 | 作用 |
|------|------|
| `cloudfunction_deploy.pyw` | **主程序**（支持 GUI + CLI 两种模式） |

### 两种模式

```powershell
# GUI 模式（默认，无控制台窗口）
pythonw "E:\skills\cloudfunction-deploy\cloudfunction_deploy.pyw"

# CLI 模式（命令行输出）
python "E:\skills\cloudfunction-deploy\cloudfunction_deploy.pyw" --cli
```

## GUI 按钮说明

| 按钮 | 功能 | 对应命令 |
|------|------|---------|
| 🔐 Login | 扫码登录微信云开发 | `tcb login` |
| ✓ Check Login | 检查登录状态 | `tcb env list --json` |
| 🌐 Env | 列出所有云环境 | `tcb env list` |
| 📋 Fn List | 列出云端已部署的云函数 | `tcb fn list -e <envId>` |
| 🚀 Deploy All | 部署所有本地云函数 | `tcb fn deploy <fn> -e <envId> --force` |
| ⚡ Deploy Selected | 部署选中的云函数 | `tcb fn deploy <fn> -e <envId> --force` |
| 🔄 Refresh | 刷新本地云函数列表 | — |
| 📂 Open Logs | 打开日志目录 | — |
| 📁 Open CloudFunctions | 打开云函数目录 | — |

## 颜色标签

| 标签 | 颜色 | 用途 |
|------|------|------|
| BOOT | 青蓝 #66ccff | 启动/状态切换 |
| INFO | 浅蓝 #00ccff | 普通信息 |
| DEPLOY | 深蓝 #00aaff | 部署中 |
| OK | 绿色 #00ff88 | 成功 |
| WARN | 黄色 #ffcc00 | 警告 |
| ERROR | 红色 #ff4444 | 失败 |
| HIGHLIGHT | 粉红 #ff88ff | 关键信息 |

## 路径配置

| 配置项 | 值 |
|--------|-----|
| 默认项目 | `E:\sEMG_B_Project` |
| 云函数目录 | `E:\sEMG_B_Project\mini_program\cloudfunctions` |
| 环境 ID | `cloud1-d4gqmimmo05b12c94` |
| 日志目录 | `E:\sEMG_B_Project\logs\cloudfunction` |
| 日志文件格式 | `cloudfunction_deploy_YYYYMMDD_HHMMSS.txt` |
| tcb CLI | 全局安装 (`@cloudbase/cli`) |

## 前置依赖

1. **Node.js** — tcb CLI 运行环境
2. **CloudBase CLI** — 全局安装：
   ```powershell
   npm install -g @cloudbase/cli
   ```
3. **微信扫码** — 首次登录需要扫码

## 注意事项

1. **首次必须扫码** — `tcb login` 会打开浏览器，扫码后保持登录
2. **登录态保留** — 后续部署自动使用已保存的登录态
3. **HTTP 触发器** — 此工具不开启 HTTP 访问，需在微信云开发控制台手动配置
4. **强制覆盖** — 部署使用 `--force` 参数覆盖同名函数
5. **单次超时** — 单个函数部署最长 180 秒
6. **创建时间不更新** — 微信云开发控制台显示的"创建时间"是首次创建时间，重新部署不会更新。但代码已更新为最新版本。

## 常见错误

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `Not logged in` | 未登录 | 点击 [Login] 扫码 |
| `Function not found` | 目录缺少 `index.js` | 检查云函数文件 |
| `TCP timeout` | 网络问题 | 稍后重试 |
| `Permission denied` | 权限不足 | 在微信云开发控制台授权 |

## 部署目标云函数

| 函数名 | 作用 |
|--------|------|
| dataIngest | 固件上传数据入口 |
| deviceRegister | 设备注册 |
| sendDeviceCommand | 小程序发送校准命令 |
| getDeviceCommand | 固件轮询获取命令 |
| ackDeviceCommand | 固件命令执行确认 |
| getDeviceStatus | 查询设备状态 |
| reportDeviceStatus | 设备上报状态 |
| uploadCalibration | 上传校准数据 |
| queryDataPoints | 查询历史肌电数据 |

## 关于创建时间

微信云开发控制台中的云函数列表显示的"创建时间"是**首次创建的时间**，重新部署不会更新这个时间。

但是：
- 每次部署都会更新函数代码
- 云函数日志中可以看到最新的部署时间
- 实际运行的是最新部署的代码

如果需要查看最新部署时间，可以在云函数详情页查看"修改时间"或查看云函数日志。
