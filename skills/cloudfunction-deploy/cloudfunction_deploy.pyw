# -*- coding: utf-8 -*-
"""
sEMG Cloud Function Deploy Tool (All-in-One)
Usage:
  - Double-click .pyw file: GUI mode (no console window)
  - Command line with --cli: CLI mode (no GUI, output to console)
  - Voice trigger: GUI mode (launched via os.startfile() or pythonw)
"""
import os
import sys

# If running with python.exe and double-clicked (no TTY), switch to pythonw.exe
if sys.platform == 'win32' and 'python.exe' in sys.executable.lower():
    try:
        # Check if stdin is a TTY (command line) or not (double-clicked)
        if not sys.stdin.isatty():
            pythonw = sys.executable.replace('python.exe', 'pythonw.exe')
            if os.path.exists(pythonw):
                os.execv(pythonw, [pythonw] + sys.argv)
    except:
        pass

# Check mode
CLI_MODE = '--cli' in sys.argv

# GUI mode imports
if not CLI_MODE:
    from tkinter import *
    from tkinter import scrolledtext, messagebox
    import threading

import time
import subprocess
import json
from pathlib import Path

# ==================== 配置 ====================
SCRIPT_DIR = Path(__file__).parent.resolve()
DEFAULT_PROJECT_DIR = Path(r"E:\sEMG_B_Project")
DEFAULT_CF_DIR = DEFAULT_PROJECT_DIR / "mini_program" / "cloudfunctions"
LOG_DIR = Path(r"E:\sEMG_B_Project\logs\cloudfunction")
ENV_ID = "cloud1-d4gqmimmo05b12c94"
TCB_CMD = "tcb"

# 部署颜色标签
COLOR_BOOT = "#66ccff"     # 启动
COLOR_INFO = "#00ccff"     # 普通信息
COLOR_OK = "#00ff88"       # 成功
COLOR_WARN = "#ffcc00"     # 警告
COLOR_ERROR = "#ff4444"    # 错误
COLOR_DEPLOY = "#00aaff"   # 部署中
COLOR_HIGHLIGHT = "#ff88ff"  # 高亮


def get_cf_dir():
    args = [a for a in sys.argv[1:] if a != '--cli']
    if args:
        d = Path(args[0])
        if d.exists():
            return d
    return DEFAULT_CF_DIR


CF_DIR = get_cf_dir()
PROJECT_DIR = CF_DIR.parent.parent

ts_str = time.strftime("%Y%m%d_%H%M%S")
LOG_FILE = LOG_DIR / f"cloudfunction_deploy_{ts_str}.txt"
LOG_DIR.mkdir(parents=True, exist_ok=True)

file_lock = threading.Lock() if not CLI_MODE else None


# ==================== CLI Mode ====================
def run_powershell(cmd_text, timeout=300):
    """在 PowerShell 中执行命令并返回结果"""
    full_cmd = f'powershell -ExecutionPolicy Bypass -Command "{cmd_text}"'
    try:
        result = subprocess.run(
            full_cmd, capture_output=True, text=True,
            timeout=timeout, encoding="utf-8", errors="replace"
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timeout"
    except Exception as e:
        return -2, "", str(e)


def scan_local_functions():
    """扫描本地云函数目录"""
    if not CF_DIR.exists():
        return []
    fns = []
    for d in CF_DIR.iterdir():
        if d.is_dir() and (d / "index.js").exists():
            fns.append(d.name)
    return sorted(fns)


def deploy_function_cli(fn_name):
    """CLI 模式部署单个云函数"""
    fn_dir = CF_DIR / fn_name
    if not fn_dir.exists():
        print(f"  [ERROR] [{fn_name}] 目录不存在: {fn_dir}")
        return False

    print(f"  >>> 部署 [{fn_name}] ...")

    cmd = f'cd "{CF_DIR}"; tcb fn deploy {fn_name} -e {ENV_ID} --force --json 2>&1'
    code, out, err = run_powershell(cmd, timeout=180)

    if out:
        for line in out.split("\n"):
            if line.strip():
                low = line.lower()
                if "success" in low or "✔" in line:
                    print(f"  [OK] {line}")
                elif "fail" in low or "error" in low:
                    print(f"  [ERROR] {line}")
                else:
                    print(f"  {line}")

    if code == 0:
        print(f"  [OK] [{fn_name}] 部署成功")
        return True
    else:
        print(f"  [ERROR] [{fn_name}] 部署失败 (exit {code})")
        return False


def cli_mode():
    """CLI 模式入口"""
    print("=" * 60)
    print("  [CloudFunction] Deploy WeChat Cloud Functions (CLI)")
    print("=" * 60)
    print(f"  CloudFunctions dir: {CF_DIR}")
    print(f"  Env ID: {ENV_ID}")
    print("=" * 60)

    # 检查登录状态
    print("\n  >>> 检查登录状态...")
    code, out, err = run_powershell("tcb env list --json", timeout=30)
    if code != 0:
        print("  [ERROR] 未登录，请先运行: python cloudfunction_deploy.pyw")
        print("  [ERROR] 在 GUI 中点击 [Login] 扫码登录")
        sys.exit(1)
    print("  [OK] 已登录")

    # 扫描函数
    fns = scan_local_functions()
    if not fns:
        print("  [ERROR] 未找到云函数")
        sys.exit(1)

    print(f"\n  待部署: {len(fns)} 个 → {fns}")

    # 部署
    ok = 0
    fail = 0
    for fn in fns:
        if deploy_function_cli(fn):
            ok += 1
        else:
            fail += 1
        time.sleep(0.3)

    print("\n" + "=" * 60)
    print(f"  [DONE] 部署完成: 成功 {ok} / 失败 {fail}")
    print("=" * 60)


# ==================== GUI Mode ====================
if not CLI_MODE:
    # 杀旧进程
    def kill_previous():
        my_pid = os.getpid()
        my_script = os.path.basename(__file__)
        try:
            subprocess.run(
                ["powershell", "-Command",
                 f"$procs = Get-CimInstance Win32_Process -Filter \"Name like 'python%.exe'\";"
                 f"foreach ($p in $procs) {{ if ($p.ProcessId -ne {my_pid} -and $p.CommandLine -like '*{my_script}*') {{ Stop-Process -Id $p.ProcessId -Force; Write-Host 'Killed old process: $($p.ProcessId)' }} }}"],
                capture_output=True, text=True
            )
            time.sleep(1)
        except Exception as e:
            print(f'kill_previous error: {e}')

    kill_previous()

    # Tkinter GUI
    root = Tk()
    root.title(f"Cloud Function Deploy — {ts_str}")
    root.geometry("900x650")

    # 状态栏
    status_var = StringVar(value="[Ready]")
    status_label = Label(root, textvariable=status_var, font="Consolas 12",
                         bg="#1a1a2e", fg="#ffcc00", anchor="w", padx=10, pady=5)
    status_label.pack(fill="x")

    # 文本显示区
    txt = scrolledtext.ScrolledText(root, wrap="word", font="Consolas 9",
                                    bg="#0d0d0d", fg="#00ccff")
    txt.pack(fill="both", expand=True, padx=5, pady=5)
    txt.tag_config("INFO", foreground=COLOR_INFO)
    txt.tag_config("WARN", foreground=COLOR_WARN)
    txt.tag_config("ERROR", foreground=COLOR_ERROR)
    txt.tag_config("BOOT", foreground=COLOR_BOOT)
    txt.tag_config("OK", foreground=COLOR_OK)
    txt.tag_config("DEPLOY", foreground=COLOR_DEPLOY)
    txt.tag_config("HIGHLIGHT", foreground=COLOR_HIGHLIGHT)


    def append(line, tag="INFO"):
        """线程安全的日志追加"""
        line = line.replace("\r", "")
        ts = time.strftime("%H:%M:%S")
        log_line = f"[{ts}] {line}"

        with file_lock:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(log_line + "\n")

        def _do():
            txt.configure(state="normal")
            txt.insert(END, log_line + "\n", tag)
            txt.see(END)
            txt.configure(state="disabled")
        txt.after(0, _do)


    def set_status(text):
        status_var.set(text)
        root.update()


    # ==================== 控制按钮 ====================
    ctrl1 = Frame(root, bg="#1a1a2e", pady=5)
    ctrl1.pack(fill="x")

    def open_logs():
        os.startfile(LOG_DIR)

    def open_cf_dir():
        if CF_DIR.exists():
            os.startfile(CF_DIR)


    Button(ctrl1, text="📂 Open Logs", command=open_logs,
           font="Consolas 9", bg="#2d2d4a", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=6)
    Button(ctrl1, text="📁 Open CloudFunctions", command=open_cf_dir,
           font="Consolas 9", bg="#2d2d4a", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=6)

    Label(ctrl1, text=f"Project: {CF_DIR.name}",
          bg="#1a1a2e", fg="#888", font="Consolas 8").pack(side=RIGHT, padx=6)


    # 部署按钮区
    ctrl2 = Frame(root, bg="#1a1a2e", pady=5)
    ctrl2.pack(fill="x")

    deploying = [False]  # 使用列表以支持内部修改


    def do_login():
        """打开浏览器扫码登录微信云开发"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        append("=== Login (扫码登录) ===", "BOOT")
        append("请在浏览器中扫描二维码完成登录", "WARN")
        threading.Thread(target=run_login, daemon=True).start()


    def do_check_login():
        """检查登录状态"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        append("=== Check Login ===", "BOOT")
        threading.Thread(target=run_check_login, daemon=True).start()


    def do_list_env():
        """列出环境"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        append("=== List Environments ===", "BOOT")
        threading.Thread(target=run_list_env, daemon=True).start()


    def do_list_fn():
        """列出已部署的云函数"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        append("=== List Functions ===", "BOOT")
        threading.Thread(target=run_list_fn, daemon=True).start()


    def do_deploy_all():
        """部署所有云函数"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        if not messagebox.askyesno("Confirm", "部署所有云函数？"):
            return
        deploying[0] = True
        append("=== Deploy All Cloud Functions ===", "BOOT")
        threading.Thread(target=run_deploy_all, daemon=True).start()


    def do_deploy_selected():
        """部署选中的云函数"""
        if deploying[0]:
            messagebox.showwarning("Busy", "正在部署中，请稍候")
            return
        sel = listbox.curselection()
        if not sel:
            messagebox.showinfo("Info", "请先在下方列表中选择云函数")
            return
        fn_names = [listbox.get(i) for i in sel]
        if not messagebox.askyesno("Confirm", f"部署以下云函数？\n{', '.join(fn_names)}"):
            return
        deploying[0] = True
        append(f"=== Deploy Selected: {fn_names} ===", "BOOT")
        threading.Thread(target=run_deploy_selected, args=(fn_names,), daemon=True).start()


    def do_reload_list():
        """重新加载云函数列表"""
        if deploying[0]:
            return
        refresh_fn_list()


    Button(ctrl2, text="🔐 Login", command=do_login,
           font="Consolas 9", bg="#553300", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="✓ Check Login", command=do_check_login,
           font="Consolas 9", bg="#005533", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="🌐 Env", command=do_list_env,
           font="Consolas 9", bg="#003355", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="📋 Fn List", command=do_list_fn,
           font="Consolas 9", bg="#333355", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="🚀 Deploy All", command=do_deploy_all,
           font="Consolas 9 bold", bg="#aa3300", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="⚡ Deploy Selected", command=do_deploy_selected,
           font="Consolas 9 bold", bg="#aa3300", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)
    Button(ctrl2, text="🔄 Refresh", command=do_reload_list,
           font="Consolas 9", bg="#555555", fg="white",
           relief="flat", padx=10).pack(side=LEFT, padx=4)


    # 函数列表区
    list_frame = Frame(root, bg="#1a1a2e")
    list_frame.pack(fill="x", padx=5, pady=5)

    Label(list_frame, text="Cloud Functions (多选):",
          bg="#1a1a2e", fg="#cccccc", font="Consolas 9").pack(anchor="w")

    listbox = Listbox(list_frame, selectmode=EXTENDED, font="Consolas 9",
                      bg="#0d0d0d", fg="#00ccff", height=4)
    listbox.pack(fill="x", pady=2)


    # ==================== 关闭事件 ====================
    def on_close():
        if deploying[0]:
            if not messagebox.askokcancel("Busy", "正在部署中，确定要关闭吗？"):
                return
        root.destroy()
        sys.exit(0)


    root.protocol("WM_DELETE_WINDOW", on_close)


    # ==================== 部署核心 ====================
    def run_login():
        """登录"""
        set_status("[Login] 等待扫码...")
        append("执行 tcb login ...", "INFO")

        code, out, err = run_powershell("tcb login", timeout=120)

        if out:
            for line in out.split("\n"):
                if line.strip():
                    tag = "OK" if "logged in" in line.lower() or "success" in line.lower() else "INFO"
                    append(f"  {line}", tag)
        if err:
            for line in err.split("\n"):
                if line.strip():
                    append(f"  {line}", "WARN")

        if code == 0:
            append("✓ 登录成功", "OK")
        else:
            append(f"✗ 登录失败 (exit {code})", "ERROR")
        set_status("[Ready]")


    def run_check_login():
        """检查登录状态"""
        set_status("[Checking] Login status...")
        code, out, err = run_powershell("tcb env list --json", timeout=30)

        if out:
            for line in out.split("\n"):
                if line.strip() and not line.startswith("{") and not line.startswith("["):
                    append(f"  {line}", "INFO")
        if code == 0:
            append("✓ 已登录", "OK")
        else:
            append("✗ 未登录，请先点击 Login 扫码", "WARN")
            if err:
                append(f"  {err.strip()}", "ERROR")
        set_status("[Ready]")


    def run_list_env():
        """列出环境"""
        set_status("[Listing] Environments...")
        code, out, err = run_powershell("tcb env list", timeout=30)
        if out:
            for line in out.split("\n"):
                if line.strip():
                    append(f"  {line}", "INFO")
        set_status("[Ready]")


    def run_list_fn():
        """列出已部署的云函数"""
        set_status("[Listing] Functions...")
        code, out, err = run_powershell(
            f"tcb fn list -e {ENV_ID}", timeout=30
        )
        if out:
            for line in out.split("\n"):
                if line.strip():
                    append(f"  {line}", "INFO")
        set_status("[Ready]")


    def refresh_fn_list():
        """刷新函数列表框"""
        listbox.delete(0, END)
        fns = scan_local_functions()
        for fn in fns:
            listbox.insert(END, fn)
        append(f"本地云函数: {len(fns)} 个", "INFO")


    def deploy_function(fn_name):
        """部署单个云函数"""
        fn_dir = CF_DIR / fn_name
        if not fn_dir.exists():
            append(f"✗ [{fn_name}] 目录不存在: {fn_dir}", "ERROR")
            return False

        append(f">>> 部署 [{fn_name}] ...", "DEPLOY")
        set_status(f"[Deploying] {fn_name}")

        cmd = f'cd "{CF_DIR}"; tcb fn deploy {fn_name} -e {ENV_ID} --force --json 2>&1'
        code, out, err = run_powershell(cmd, timeout=180)

        if out:
            for line in out.split("\n"):
                if not line.strip():
                    continue
                tag = "INFO"
                low = line.lower()
                if "success" in low or "✓" in line or "✔" in line:
                    tag = "OK"
                elif "fail" in low or "error" in low or "✗" in line:
                    tag = "ERROR"
                elif "deploy" in low or "上传" in line:
                    tag = "DEPLOY"
                append(f"  {line}", tag)

        if code == 0:
            append(f"✓ [{fn_name}] 部署成功", "OK")
            return True
        else:
            append(f"✗ [{fn_name}] 部署失败 (exit {code})", "ERROR")
            return False


    def run_deploy_all():
        """部署所有云函数"""
        try:
            fns = scan_local_functions()
            if not fns:
                append("✗ 未找到云函数", "ERROR")
                return

            append(f"待部署: {len(fns)} 个 → {fns}", "HIGHLIGHT")
            ok = 0
            fail = 0
            for fn in fns:
                if deploy_function(fn):
                    ok += 1
                else:
                    fail += 1
                time.sleep(0.5)

            append("", "INFO")
            append(f"=== 部署完成: 成功 {ok} / 失败 {fail} ===", "OK" if fail == 0 else "WARN")
        finally:
            deploying[0] = False
            set_status("[Ready]")


    def run_deploy_selected(fn_names):
        """部署选中的云函数"""
        try:
            ok = 0
            fail = 0
            for fn in fn_names:
                if deploy_function(fn):
                    ok += 1
                else:
                    fail += 1
                time.sleep(0.5)

            append("", "INFO")
            append(f"=== 部署完成: 成功 {ok} / 失败 {fail} ===", "OK" if fail == 0 else "WARN")
        finally:
            deploying[0] = False
            set_status("[Ready]")


    # ==================== 启动 ====================
    try:
        append("=== Cloud Function Deploy Tool ===", "BOOT")
        append(f"Project: {PROJECT_DIR}", "INFO")
        append(f"Cloud Functions: {CF_DIR}", "INFO")
        append(f"Env ID: {ENV_ID}", "INFO")
        append(f"Log file: {LOG_FILE}", "INFO")
        append("", "INFO")
        append("首次使用：点击 [Login] 扫码登录微信云开发", "WARN")
        append("之后会自动保存登录态，无需重复扫码", "WARN")
        append("", "INFO")

        refresh_fn_list()
        set_status("[Ready] 点击 Login 扫码登录")
        root.mainloop()
    except Exception as e:
        import traceback
        err_msg = f"FATAL ERROR: {e}\n{traceback.format_exc()}"
        print(err_msg)
        with open(LOG_DIR / f"crash_{ts_str}.txt", "w", encoding="utf-8") as f:
            f.write(err_msg)
        sys.exit(1)


# ==================== Entry Point ====================
if __name__ == "__main__":
    if CLI_MODE:
        cli_mode()