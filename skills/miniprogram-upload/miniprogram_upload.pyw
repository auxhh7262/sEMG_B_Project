# -*- coding: utf-8 -*-
"""
sEMG Mini Program Compile + Log Server Tool (All-in-One)
Usage:
  - Double-click .pyw file: GUI mode (no console window)
  - Command line with --cli: CLI mode (no GUI, output to console)
  - OpenClaw trigger: GUI mode

Architecture:
  - Firmware uploads data via HTTPS POST to cloud functions (dataIngest)
  - Mini program fetches data from cloud functions (queryDataPoints)
  - Mini program logs: During development, logs are sent to local HTTP server (port 9876)
                     for debugging. This tool provides the local log server.
  - Log server receives logs from mini program via HTTP POST (wx.request)
"""
import os
import sys
import time
import subprocess
import threading
import http.server
import json
from pathlib import Path
from tkinter import *
from tkinter import scrolledtext

# --- Config ---
SCRIPT_DIR = Path(__file__).parent.resolve()
DEFAULT_PROJECT_DIR = Path(r"E:\sEMG_B_Project")
CLI_PATH = r"D:\Program Files\微信web开发者工具\cli.bat"
LOG_DIR = Path(r"E:\logs\mini")
PORT = 9876
FILTER_KEYWORDS = ["LogForward", "heartbeat", "ping", "pong"]

# Check mode
CLI_MODE = '--cli' in sys.argv

def kill_previous():
    """Kill old processes running the same script (both python.exe and pythonw.exe)."""
    my_pid = os.getpid()
    my_script = os.path.basename(__file__)
    try:
        subprocess.run(
            ['powershell', '-Command',
             f'$procs = Get-CimInstance Win32_Process -Filter "Name like \'python%.exe\'";'
             f'foreach ($p in $procs) {{ if ($p.ProcessId -ne {my_pid} -and ($p.CommandLine -like "*{my_script}*" -or $p.CommandLine -like "*mini_log_server*")) {{ Stop-Process -Id $p.ProcessId -Force; Write-Host "Killed old: $($p.ProcessId)" }} }}'],
            capture_output=True, text=True)
        time.sleep(1)
    except Exception as e:
        print(f'kill_previous error: {e}')

def get_project_dir():
    """Get mini program directory. Accepts either project root or mini_program directory."""
    args = sys.argv[1:]
    if args and args[0] != '--cli':
        d = Path(args[0])
        if d.exists():
            # If path ends with 'mini_program' and is a directory, use directly
            if d.name == 'mini_program' and d.is_dir():
                return d
            # Otherwise treat as project root, append mini_program
            return d / 'mini_program'
    return DEFAULT_PROJECT_DIR / 'mini_program'

PROJECT_DIR = Path(r"E:\sEMG_B_Project")
MINI_PROGRAM_DIR = get_project_dir()

os.makedirs(LOG_DIR, exist_ok=True)

ts_str = time.strftime('%Y%m%d_%H%M%S')
LOG_FILE = LOG_DIR / f'mini_log_{ts_str}.txt'

file_lock = threading.Lock()

def log_msg(msg):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = time.strftime('%H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f'[{ts}] {msg}\n')

# ==================== HTTP Log Server ====================
class LogHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/log":
            self.send_response(404)
            self.end_headers()
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))

            if isinstance(data, list):
                logs = data
            elif isinstance(data, dict):
                if "logs" in data:
                    logs = data["logs"]
                elif "level" in data and "msg" in data:
                    logs = [data]
                else:
                    logs = [{"level": "INFO", "msg": json.dumps(data, ensure_ascii=False)}]
            else:
                logs = [{"level": "INFO", "msg": str(data)}]

            for log_entry in logs:
                level = log_entry.get("level", "INFO").upper()
                msg = log_entry.get("msg", "")
                self.write_gui_log(level, msg, log_entry.get("time", None))

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))

        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
        except Exception as e:
            self.write_gui_log("ERROR", f"处理日志请求失败: {e}")
            self.send_response(500)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "port": PORT}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress HTTP server logs

    def write_gui_log(self, level, msg, timestamp=None):
        if any(kw in msg for kw in FILTER_KEYWORDS):
            return
        tag = "INFO"
        upper_level = level.upper()
        if "ERROR" in upper_level or "FATAL" in upper_level:
            tag = "ERROR"
        elif "WARN" in upper_level:
            tag = "WARN"
        elif "BOOT" in upper_level or "START" in upper_level:
            tag = "BOOT"
        
        # This will be overridden in gui_mode to append to GUI
        print(f"[{level}] {msg}")

server = None

def start_http_server():
    global server
    try:
        server = http.server.HTTPServer(("0.0.0.0", PORT), LogHandler)
        server.serve_forever()
    except OSError as e:
        print(f'[ERROR] Cannot bind port {PORT}: {e}')
        print('[ERROR] Another log server might be running. Kill old processes first.')
    except Exception as e:
        print(f'[ERROR] HTTP server error: {e}')

def detect_changes():
    """Detect mini program code changes in last 30 minutes."""
    if not MINI_PROGRAM_DIR.exists():
        return []
    cutoff = time.time() - 30 * 60
    changed = []
    for ext in ('.js', '.json', '.wxml', '.wxss', '.ts'):
        for f in MINI_PROGRAM_DIR.rglob(f'*{ext}'):
            try:
                if f.stat().st_mtime > cutoff:
                    changed.append(str(f.relative_to(PROJECT_DIR)))
            except ValueError:
                changed.append(str(f))
    return changed

def compile_miniprogram():
    """Compile mini program via WeChat DevTools CLI."""
    if not MINI_PROGRAM_DIR.exists():
        return False, f"Mini program directory not found: {MINI_PROGRAM_DIR}"

    try:
        result = subprocess.run(
            [CLI_PATH, 'auto-preview', '--project', str(MINI_PROGRAM_DIR)],
            capture_output=True,
            text=True,
            timeout=120,
            encoding='utf-8',
            errors='replace'
        )

        if result.returncode != 0:
            err = result.stderr.strip() or result.stdout.strip()
            return False, err
        return True, result.stdout
    except subprocess.TimeoutExpired:
        return False, "Compile timeout (120s)"
    except Exception as e:
        return False, str(e)

def cli_mode():
    """Command-line mode"""
    print('=== sEMG Mini Program Compile Tool (CLI) ===')
    print()

    print('[1/3] Checking changes...')
    changed = detect_changes()
    if changed:
        print(f'  Changed files ({len(changed)}):')
        for f in changed[:10]:
            print(f'    + {f}')
        if len(changed) > 10:
            print(f'    ... and {len(changed) - 10} more')
    else:
        print('  No changes in last 30 minutes')

    print()
    print('[2/3] Compiling mini program...')
    print(f'  CLI: {CLI_PATH}')
    print(f'  Project: {MINI_PROGRAM_DIR}')

    success, output = compile_miniprogram()
    if success:
        print('  Compile SUCCESS!')
        print('  Preview pushed to phone.')
    else:
        print('  Compile FAILED!')
        print(f'  Error: {output}')

    print()
    print('[3/3] Starting log server...')
    print(f'  Log server listening on port {PORT}')
    print('  Mini program should send logs to: http://<your-ip>:9876/log')
    print('  Press Ctrl+C to stop.')
    
    # Start log server
    start_http_server()

def gui_mode():
    """GUI mode"""
    global server
    
    kill_previous()

    root = Tk()
    root.title(f'sEMG Mini Program Tool - {ts_str}')
    root.geometry('900x600')

    status_var = StringVar(value='[Starting]')
    status_label = Label(root, textvariable=status_var, font='Consolas 12',
                         bg='#1a1a2e', fg='#ffcc00', anchor='w', padx=10, pady=5)
    status_label.pack(fill='x')

    txt = scrolledtext.ScrolledText(root, wrap='none', font='Consolas 9',
                                      bg='#0d0d0d', fg='#00ccff')
    txt.pack(fill='both', expand=True)

    txt.tag_config('INFO', foreground='#00ccff')
    txt.tag_config('WARN', foreground='#ffcc00')
    txt.tag_config('ERROR', foreground='#ff4444')
    txt.tag_config('BOOT', foreground='#66ccff')
    txt.tag_config('COMPILE', foreground='#00aaff')
    txt.tag_config('HTTP', foreground='#888888')

    def append(line, tag='INFO'):
        line = line.replace('\r', '')
        ts = time.strftime('%H:%M:%S')
        log_line = f'[{ts}] {line}'
        
        with file_lock:
            with open(LOG_FILE, 'a', encoding='utf-8') as f:
                f.write(log_line + '\n')
        
        def _do():
            txt.configure(state='normal')
            txt.insert('end', log_line + '\n', tag)
            txt.see('end')
            txt.configure(state='disabled')
        txt.after(0, _do)

    def set_status(text):
        status_var.set(text)
        root.update()

    # Override LogHandler.write_gui_log to append to GUI
    def write_gui_log_override(self, level, msg, timestamp=None):
        if any(kw in msg for kw in FILTER_KEYWORDS):
            return
        tag = "INFO"
        upper_level = level.upper()
        if "ERROR" in upper_level or "FATAL" in upper_level:
            tag = "ERROR"
        elif "WARN" in upper_level:
            tag = "WARN"
        elif "BOOT" in upper_level or "START" in upper_level:
            tag = "BOOT"
        append(f"[{level}] {msg}", tag)
    
    LogHandler.write_gui_log = write_gui_log_override

    def compile_workflow():
        try:
            set_status('[1/3] Checking changes...')
            append('=== Mini Program Compile + Log Server ===', 'BOOT')
            append(f'Project: {PROJECT_DIR}', 'INFO')
            append(f'Mini program: {MINI_PROGRAM_DIR}', 'INFO')
            append(f'Log file: {LOG_FILE}', 'INFO')
            append(f'Log server port: {PORT}', 'INFO')
            time.sleep(0.5)

            changed = detect_changes()
            if changed:
                append(f'Changed files ({len(changed)}):', 'INFO')
                for f in changed[:10]:
                    append(f'  + {f}', 'INFO')
                if len(changed) > 10:
                    append(f'  ... and {len(changed) - 10} more', 'INFO')
            else:
                append('No changes in last 30 minutes', 'INFO')

            set_status('[2/3] Compiling mini program...')
            append('>>> Compiling mini program...', 'COMPILE')

            if not MINI_PROGRAM_DIR.exists():
                append(f'Mini program directory not found: {MINI_PROGRAM_DIR}', 'ERROR')
                set_status('[Failed] Directory not found')
                return

            append(f'CLI: {CLI_PATH}', 'INFO')
            append(f'Project: {MINI_PROGRAM_DIR}', 'INFO')

            success, output = compile_miniprogram()

            if success:
                append('Compile OK, preview pushed to phone', 'COMPILE')
                set_status('[Success] Preview pushed to phone')
                append('Check your phone for preview.', 'INFO')
            else:
                append('Compile FAILED!', 'ERROR')
                for line in output.split('\n')[-15:]:
                    if line.strip():
                        append(f'  {line}', 'ERROR')
                set_status('[Failed] Compile error')
                return

            set_status(f'[3/3] Starting log server (:{PORT})...')
            append(f'>>> Starting log server on port {PORT}...', 'COMPILE')
            
            threading.Thread(target=start_http_server, daemon=True).start()
            time.sleep(0.5)
            
            set_status(f'[Running] Log server :{PORT}')
            append(f'Log server running on port {PORT}', 'BOOT')
            append(f'Mini program should send logs to: http://<your-ip>:{PORT}/log', 'INFO')

        except Exception as e:
            append(f'ERROR: {e}', 'ERROR')
            set_status('[Failed]')

    bottom_frame = Frame(root, bg='#1a1a2e', pady=5)
    bottom_frame.pack(fill='x')

    def open_logs():
        os.startfile(LOG_DIR)

    Button(bottom_frame, text='[Folder] Open Logs', command=open_logs,
           font='Consolas 9', bg='#2d2d4a', fg='white', relief='flat', padx=10).pack(side='left', padx=10)

    Label(bottom_frame, text=str(LOG_FILE),
          bg='#1a1a2e', fg='#888', font='Consolas 8').pack(side='right', padx=10)

    def on_closing():
        global server
        if server:
            try:
                server.shutdown()
            except:
                pass
        root.destroy()

    root.protocol('WM_DELETE_WINDOW', on_closing)

    append('Starting...', 'BOOT')
    threading.Thread(target=compile_workflow, daemon=True).start()
    root.mainloop()

if __name__ == '__main__':
    if CLI_MODE:
        cli_mode()
    else:
        gui_mode()
