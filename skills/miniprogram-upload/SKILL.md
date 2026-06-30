---
name: miniprogram-upload
description: 小程序编译预览 + 日志采集工具。当用户说"编译小程序"、"预览小程序"、"上传小程序"、"生成预览码"、"开启小程序日志"、"启动日志服务器"时触发此skill。调用微信开发者工具CLI编译并推送预览到手机，同时启动日志服务器采集小程序日志。
---

# miniprogram-upload

小程序编译预览 + 日志采集一体化工具（GUI + CLI 双模式）。

---

## 触发词

- "编译小程序"
- "预览小程序"
- "上传小程序"
- "生成预览码"
- "开启小程序日志"
- "启动日志服务器"

---

## 工作流程

```
1. 检测小程序代码改动（30分钟内修改的文件）
2. 调用微信开发者工具 CLI 编译小程序（auto-preview）
3. 生成预览，推送到手机（无需扫码）
4. 启动日志服务器 GUI（HTTP 端口 9876）
```

---

## 脚本

### 两种模式

```powershell
# GUI 模式（双击或 pythonw 运行，无控制台窗口）
pythonw "E:\skills\miniprogram-upload\miniprogram_upload.pyw"

# CLI 模式（有控制台输出）
python "E:\skills\miniprogram-upload\miniprogram_upload.pyw" --cli

# 指定项目目录
pythonw "E:\skills\miniprogram-upload\miniprogram_upload.pyw" E:\sEMG_B_Project
```

---

## GUI 功能

| 功能 | 说明 |
|------|------|
| 自动编译 | 启动后自动检测最近修改的文件，编译并推送预览 |
| 日志服务器 | HTTP 端口 9876，接收小程序发来的日志 |
| 实时显示 | GUI 实时显示日志，按级别着色 |
| 日志保存 | 自动写入 `E:\sEMG_B_Project\logs\mini\mini_log_*.txt` |
| [Open Logs] | 打开日志目录 |

## 颜色标签

| 标签 | 颜色 | 用途 |
|------|------|------|
| BOOT | 青蓝 `#66ccff` | 启动/状态切换 |
| INFO | 浅蓝 `#00ccff` | 普通日志 |
| COMPILE | 深蓝 `#00aaff` | 编译/上传 |
| WARN | 黄色 `#ffcc00` | 警告 |
| ERROR | 红色 `#ff4444` | 错误 |
| HTTP | 灰色 `#888888` | HTTP 请求 |

---

## 日志服务器功能

mini_program_upload.pyw 内部集成了 HTTP 日志服务器，替代了独立的 `mini_log_server.py`。

### 日志采集流程

```
小程序 log/warn/error (app.js _forwardLog)
  → 批处理（10条/批 或 500ms超时）
  → wx.request POST → http://192.168.137.1:9876/log
  → LogHandler (HTTP Server)
     → 解析 JSON（支持单条/数组/带 logs 字段）
     → 按级别着色显示到 GUI
     → 写入 E:\sEMG_B_Project\logs\mini\mini_log_*.txt
```

### 日志服务器特性

| 特性 | 说明 |
|------|------|
| POST 端点 | `http://<ip>:9876/log` |
| 输入格式 | JSON 单条 `{"level":"INFO","msg":"..."}` / JSON 数组 / `{"logs":[...]}` |
| CORS | ✅ 支持跨域（`Access-Control-Allow-Origin: *`） |
| OPTIONS | ✅ 支持预检请求 |
| 健康检查 | GET `http://<ip>:9876/health` → `{"status":"ok","port":9876}` |
| 日志过滤 | 内置关键词过滤（`FILTER_KEYWORDS`），不显示/保存含 `LogForward`、`heartbeat`、`ping`、`pong` 的日志 |
| HTTP 日志静音 | `log_message()` 重写为 pass，避免 HTTP 服务器自己的访问日志污染界面 |

### 日志过滤

```python
FILTER_KEYWORDS = ["LogForward", "heartbeat", "ping", "pong"]
```

包含以上关键词的日志行不会显示到 GUI 也不会保存到文件。

---

## AI 执行逻辑

当识别到触发词时，执行：

```powershell
# 杀掉所有旧的 miniprogram_upload 进程
$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%.exe'"
foreach ($p in $procs) {
    if ($p.ProcessId -ne $PID -and 
        ($p.CommandLine -like '*miniprogram_upload*')) {
        Stop-Process -Id $p.ProcessId -Force
    }
}
Start-Sleep -Seconds 1

# 启动新的 GUI
pythonw "E:\skills\miniprogram-upload\miniprogram_upload.pyw"
```

---

## 路径配置

| 配置项 | 值 |
|--------|-----|
| 小程序目录 | `E:\sEMG_B_Project\mini_program` |
| CLI 路径 | `D:\Program Files\微信web开发者工具\cli.bat` |
| 日志目录 | `E:\sEMG_B_Project\logs\mini` |
| 日志文件格式 | `mini_log_YYYYMMDD_HHMMSS.txt` |
| 日志服务器端口 | 9876 |
| 过滤关键词 | `LogForward`, `heartbeat`, `ping`, `pong` |

---

## 注意事项

1. 日志转发 `LOG_ENABLED = true`（发布前改为 false）
2. 手机需与 PC 在同一 WiFi 网络（热点 IP 192.168.137.x）
3. 日志服务器 IP 应为 192.168.137.1（热点主机 IP）
4. 手机不在热点上时日志不可达（走的是本地 HTTP，非云函数）

---

## 相关文档

- **Skill 体系概览：** [`../README.md`](../README.md)
- **固件上传：** [`../firmware-upload/SKILL.md`](../firmware-upload/SKILL.md)
- **组合工作流：** [`../workflow/SKILL.md`](../workflow/SKILL.md)
