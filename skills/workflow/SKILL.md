---
name: workflow
description: sEMG项目组合工作流，一键顺序启动 firmware-upload → miniprogram-upload。当用户说"上传并编译"/"完整上传"/"一键部署"/"部署全部"时触发此skill。
---

# workflow

sEMG 项目组合工作流 Skill，一键顺序启动两个子工具。

---

## 触发词

- "上传并编译"
- "完整上传"
- "一键部署"
- "部署全部"
- "开始工作流"

---

## 工作流程

**启动顺序：**
```
1. firmware-upload → 编译固件 + 烧录 + 串口监控 GUI
   （等待 10 秒让固件完成上传和重启）
2. miniprogram-upload → 编译小程序 + 推送到手机 + 日志服务器 GUI
```

**两个 GUI 同时运行：**
- 📡 sEMG Firmware Tool（固件串口监控）
- 📱 sEMG Mini Program Tool（小程序日志）

---

## 使用方式

### 方式一：指令触发

```
说："上传并编译"
```

→ AI 启动 workflow（自动打开两个 GUI 窗口）。

### 方式二：双击文件

```powershell
双击 E:\sEMG_B_Project\skills\workflow\workflow.pyw
```

### 方式三：命令行

```powershell
# 默认路径（E:\sEMG_B_Project）
pythonw "E:\sEMG_B_Project\skills\workflow\workflow.pyw"

# CLI 模式（有控制台输出）
python "E:\sEMG_B_Project\skills\workflow\workflow.pyw" --cli

# 指定固件目录 + 项目目录
python "E:\sEMG_B_Project\skills\workflow\workflow.pyw" --cli E:\sEMG_B_Project\firmware E:\sEMG_B_Project
```

---

## 技术实现

`workflow.pyw` 调用其他 skill 的 `.pyw` 脚本：

| 步骤 | 操作 | 调用脚本 |
|------|------|----------|
| 1 | 清理残留 pio 进程 | — |
| 2 | 启动 firmware-upload（自动上传 + 监控） | `firmware-upload/firmware_upload.pyw` |
| 3 | 等待 10 秒（固件上传 + 重启） | `time.sleep(10)` |
| 4 | 启动 miniprogram-upload（编译 + 日志服务器） | `miniprogram-upload/miniprogram_upload.pyw` |

### 技术特性

| 特性 | 说明 |
|------|------|
| **顺序启动** | firmware 先启动，10 秒后启动 miniprogram |
| **无额外 GUI** | workflow 本身不显示窗口，直接启动两个子工具 |
| **各自独立** | 每个子工具有自己的 `kill_previous()` |
| **pythonw.exe** | 所有 skill 用 pythonw.exe 启动，无控制台窗口 |
| **自动查找 pythonw** | `get_pythonw()` 从 sys.executable 推导 pythonw.exe 路径 |
| **清理 pio 进程** | 启动前杀掉残留的 pio/platformio 进程 |

---

## AI 执行逻辑

当识别到触发词时，执行：

```powershell
# 杀掉旧的 workflow 进程
$procs = Get-CimInstance Win32_Process -Filter "Name like 'python%.exe'"
foreach ($p in $procs) {
    if ($p.ProcessId -ne $PID -and $p.CommandLine -like '*workflow.pyw*') {
        Stop-Process -Id $p.ProcessId -Force
    }
}

# 启动 workflow（会自动启动两个子工具）
pythonw "E:\sEMG_B_Project\skills\workflow\workflow.pyw"
```

---

## 依赖 Skill

| Skill | 用途 | 必须 |
|-------|------|------|
| firmware-upload | 编译固件 + 烧录 + 串口监控 | ✅ |
| miniprogram-upload | 编译小程序 + 预览推送 + 日志服务器 | ✅ |

## 独立 Skill（不在此工作流中）

| Skill | 说明 |
|-------|------|
| cloudfunction-deploy | 单独调用，部署云函数到微信云 |
| log-analyze | 单独调用，分析固件/小程序日志 |
| git-push | 单独调用，Git 提交推送 |

---

## 相关文档

- **Skill 体系概览：** [`../README.md`](../README.md)
- **固件上传：** [`../firmware-upload/SKILL.md`](../firmware-upload/SKILL.md)
- **小程序预览：** [`../miniprogram-upload/SKILL.md`](../miniprogram-upload/SKILL.md)
- **云函数部署：** [`../cloudfunction-deploy/SKILL.md`](../cloudfunction-deploy/SKILL.md)
- **日志分析：** [`../log-analyze/SKILL.md`](../log-analyze/SKILL.md)
