---
name: firmware-upload
description: sEMG固件编译上传工具（GUI版本）。当用户说"上传固件"/"编译上传"/"烧录固件"/"upload firmware"/"刷固件"/"重新烧录"时，启动GUI窗口执行完整流程（杀进程→编译上传→串口监控）。触发后自动弹出"sEMG Firmware Tool"窗口，无需手动操作。
---

# firmware-upload

sEMG 固件编译上传 + 串口监控一体化工具（GUI + CLI 双模式）。

---

## 触发词

- "上传固件"
- "编译上传"
- "烧录固件"
- "upload firmware"
- "刷固件"
- "重新烧录"

---

## 功能说明

触发后自动弹出 GUI 窗口，执行完整流水线：

1. **杀旧进程** — 杀掉旧的 `firmware_upload.pyw` 进程 + 占用 COM4 的 pio/platformio 进程
2. **清理锁文件** — 自动删除 PlatformIO 的 `platforms.lock` / `packages.lock`（避免权限错误）
3. **编译上传** — 调用 `pio run -t upload --upload-port COM4`，设置 `PIO_HOME` 到项目本地
4. **串口监控** — 上传完成后自动启动串口监控（COM4 @ 115200 baud），完整捕获开机日志

GUI 特点：
- 深色终端风格界面
- 实时着色显示日志（绿色=INFO、黄色=WARN、红色=ERROR、浅蓝=BOOT、蓝色=UPLOAD）
- 自动保存日志到 `E:\sEMG_B_Project\logs\serial\serial_log_YYYYMMDD_HHMMSS.txt`
- 可点击 [Open Logs] 按钮打开日志文件夹

---

## 使用方式

### 方式一：指令触发（推荐）

在 AI Agent（QClaw / TRAE / WorkBuddy）中说：
- "上传固件"
- "编译上传"
- "烧录固件"

→ AI 自动杀掉旧进程，然后启动 GUI 窗口。

### 方式二：双击文件

```powershell
双击 E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw
```

双击时会自动检测运行环境，如果双击（无 TTY）则自动切换到 `pythonw.exe` 运行。

---

## 两种模式

```powershell
# GUI 模式（默认，无控制台窗口）
pythonw "E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw"

# CLI 模式（命令行输出）
python "E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw" --cli

# 指定固件目录
pythonw "E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw" E:\sEMG_B_Project\firmware
```

---

## AI 执行逻辑

当识别到触发词时，执行：

```powershell
# 杀掉所有旧的 firmware_upload.pyw 进程
$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%.exe'"
foreach ($p in $procs) {
    if ($p.ProcessId -ne $PID -and $p.CommandLine -like '*firmware_upload.pyw*') {
        Stop-Process -Id $p.ProcessId -Force
    }
}
Start-Sleep -Seconds 1

# 启动新的 GUI
pythonw "E:\sEMG_B_Project\skills\firmware-upload\firmware_upload.pyw"
```

**注意**：工具内部自带 `kill_previous()`，启动时也会杀旧进程 + 清理锁文件 + 杀 pio 进程。

---

## 路径配置

| 配置项           | 值                                                    |
| ---------------- | ----------------------------------------------------- |
| 固件目录（默认） | `E:\sEMG_B_Project\firmware`                          |
| 串口             | COM4 / 115200 baud                                    |
| pio.exe          | `C:\Users\honghuang\.platformio\penv\Scripts\pio.exe` |
| PIO_HOME         | 项目内 `.pio` 目录（避免锁文件冲突）                  |
| 日志目录         | `E:\sEMG_B_Project\logs\serial`                       |
| 日志文件格式     | `serial_log_YYYYMMDD_HHMMSS.txt`                      |

---

## 文件

| 文件                  | 作用                       |
| --------------------- | -------------------------- |
| `firmware_upload.pyw` | 主程序（GUI + CLI 双模式） |
| `SKILL.md`            | 本文件                     |

---

## 内部实现细节

### python.exe → pythonw.exe 自动切换

脚本开头的 `os.execv()` 在检测到以下条件时自动切换：
- Windows 系统
- 以 `python.exe` 运行（而非 `pythonw.exe`）
- 无 TTY（双击文件，非命令行）

### PlatformIO 锁文件清理

```python
for lf in ['platforms.lock', 'packages.lock']:
    try:
        os.remove(lf_path)
    except PermissionError:
        pass  # 占用中则跳过
```

### PIO_HOME 环境变量

上传时设置 `PIO_HOME` 到项目本地的 `.pio` 目录，避免与全局 PlatformIO 锁文件冲突。

### 串口监控（v2.1）

**行缓冲区处理**：使用 `line_buf` 跨 `read()` 调用组装完整行，解决 pyserial 分包导致一条 log 被拆成两行的问题。

**ASCII 过滤**：过滤含非 ASCII 字符（ord(c) > 127）的行，避免 bootloader 二进制数据被 UTF-8 解码为乱码（如"昆昆昆"）。

**开机日志完整捕获**：上传完成后立即启动串口监控，利用固件 `delay(3000)` 的启动延迟窗口，等待板子重启并完整捕获从 `========== sEMG V3.0 CLOUD BOOT ==========` 开始的所有开机日志。

---

## 常见问题

### 上传失败（COM4 占用）
说"上传固件"，Skill 自动杀占用 COM4 的进程。或手动关闭占用 COM4 的程序。

### 开机日志丢失
新版本已修复：上传完成后立即启动串口监控，利用固件 3 秒启动延迟，完整捕获所有开机日志。

### 串口乱码（昆昆昆）
新版本已修复：过滤含非 ASCII 字符的行，避免 bootloader 二进制数据被错误解码。

### 双击 .pyw 无反应
检查 `pythonw.exe` 是否安装：
```powershell
where pythonw
```

---

## 相关文档

- **Skill 体系概览：** [`../README.md`](../README.md)
- **组合工作流：** [`../workflow/SKILL.md`](../workflow/SKILL.md)