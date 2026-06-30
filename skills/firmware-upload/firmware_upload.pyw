# -*- coding: utf-8 -*-
"""
sEMG Firmware Upload Tool (All-in-One)
Usage:
  - Double-click .pyw file: GUI mode (no console window)
  - Command line with --cli: CLI mode (no GUI, output to console)
  - OpenClaw trigger: GUI mode (launched via os.startfile() or pythonw)
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
    from tkinter import scrolledtext
    import threading
    import serial

import time
import subprocess
from pathlib import Path

# Config
SCRIPT_DIR = Path(__file__).parent.resolve()
FIRMWARE_DIR_DEFAULT = r"E:\sEMG_B_Project\firmware"
LOG_DIR = Path(r"E:\sEMG_B_Project\logs\serial")
PORT = 'COM4'
BAUD = 115200
PIO_EXE = r"C:\Users\honghuang\.platformio\penv\Scripts\pio.exe"

ts_str = time.strftime('%Y%m%d_%H%M%S')
LOG_FILE = LOG_DIR / f'serial_log_{ts_str}.txt'

def get_firmware_dir():
    args = sys.argv[1:]
    if args and args[0] != '--cli':
        d = Path(args[0])
        if d.exists():
            return str(d)
    return FIRMWARE_DIR_DEFAULT

FIRMWARE_DIR = get_firmware_dir()

def log_msg(msg):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = time.strftime('%H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f'[{ts}] {msg}\n')

def kill_previous():
    """Kill old firmware-upload processes and delete stale lock files."""
    my_pid = os.getpid()
    
    try:
        # Kill old firmware_upload.pyw processes (but not myself)
        subprocess.run(
            ['powershell', '-Command',
             f'$procs = Get-CimInstance Win32_Process -Filter "Name like \'python%.exe\'";'
             f'foreach ($p in $procs) {{ if ($p.ProcessId -ne {my_pid} -and $p.CommandLine -like "*firmware_upload.pyw*") {{ Stop-Process -Id $p.ProcessId -Force }} }}'],
            capture_output=True, text=True)
        
        # Kill pio and platformio
        subprocess.run(
            ['powershell', '-Command',
             'Get-Process pio,platformio -ErrorAction SilentlyContinue | Stop-Process -Force'],
            capture_output=True)
        
        time.sleep(1)
        
    except Exception as e:
        print(f'kill_previous error: {e}')
    
    # Delete stale lock files in global PlatformIO directory
    try:
        pio_home = os.path.expanduser(r'~\.platformio')
        for lf in ['platforms.lock', 'packages.lock']:
            lf_path = os.path.join(pio_home, lf)
            if os.path.exists(lf_path):
                try:
                    os.remove(lf_path)
                    print(f'Deleted lock file: {lf_path}')
                except PermissionError:
                    print(f'Lock file in use (will retry): {lf_path}')
        time.sleep(1)
    except Exception as e:
        print(f'Failed to delete lock files: {e}')

def upload_firmware(firmware_dir, log_func=None):
    """Upload firmware, return True if success.
    If log_func is provided, output is streamed to it in real-time.
    """
    msg = log_func if log_func else log_msg
    msg('>>> Uploading firmware...')
    
    # Set PIO_HOME to project-local directory to avoid lock file conflicts
    pio_home = os.path.join(os.path.dirname(firmware_dir), '.pio')
    os.makedirs(pio_home, exist_ok=True)
    env = os.environ.copy()
    env['PLATFORMIO_I_DIR'] = pio_home
    
    process = subprocess.Popen(
        [PIO_EXE, 'run', '-t', 'upload', '--upload-port', PORT],
        cwd=firmware_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding='utf-8',
        errors='replace',
        env=env
    )
    
    last_lines = []
    for line in process.stdout:
        line = line.rstrip()
        if line:
            last_lines.append(line)
            if len(last_lines) > 50:
                last_lines.pop(0)
            msg(f'  {line}')
    
    process.wait()
    
    if process.returncode != 0:
        msg(f'Upload failed (exit {process.returncode})')
        return False
    
    msg('Upload OK, board rebooting...')
    return True

def cli_mode():
    """Command-line mode (no GUI)"""
    print('=== sEMG Firmware Upload Tool (CLI) ===')
    print()
    
    print('[1/3] Killing old processes...')
    kill_previous()
    
    print('[2/3] Uploading firmware...')
    print(f'  Firmware: {FIRMWARE_DIR}')
    
    if not upload_firmware(FIRMWARE_DIR, print):
        print('  Upload FAILED!')
        sys.exit(1)
    
    print('  Upload OK!')
    print()
    print('[3/3] Done!')
    print('You can now monitor serial output with:')
    print(f'  python -m serial.tools.miniterm {PORT} {BAUD}')

def gui_mode():
    """GUI mode"""
    kill_previous()
    os.makedirs(LOG_DIR, exist_ok=True)
    
    root = Tk()
    root.title(f'sEMG Firmware Tool - {ts_str}')
    root.geometry('900x600')
    
    status_var = StringVar(value='[Starting]')
    status_label = Label(root, textvariable=status_var, font='Consolas 12',
                         bg='#1a1a2e', fg='#ffcc00', anchor='w', padx=10, pady=5)
    status_label.pack(fill='x')
    
    txt = scrolledtext.ScrolledText(root, wrap='none', font='Consolas 9',
                                      bg='#0d0d0d', fg='#00cc66')
    txt.pack(fill='both', expand=True)
    
    txt.tag_config('INFO', foreground='#00cc66')
    txt.tag_config('WARN', foreground='#ffcc00')
    txt.tag_config('ERROR', foreground='#ff4444')
    txt.tag_config('BOOT', foreground='#66ccff')
    txt.tag_config('UPLOAD', foreground='#00aaff')
    
    ser = None
    monitoring = False
    
    def append(line, tag='INFO'):
        line = line.replace('\r', '')
        ts = time.strftime('%H:%M:%S')
        txt.configure(state='normal')
        txt.insert('end', f'[{ts}] {line}\n', tag)
        txt.see('end')
        txt.configure(state='disabled')
        log_msg(line)
    
    def set_status(text):
        status_var.set(text)
        root.update()
    
    def detect_tag(line):
        l = line.upper()
        if any(k in l for k in ['ERROR', 'FATAL', 'ASSERT']):
            return 'ERROR'
        if 'WARN' in l:
            return 'WARN'
        if any(k in l for k in ['BOOT', 'START', '=========']):
            return 'BOOT'
        if any(k in l for k in ['UPLOAD', '>>>', 'KILL']):
            return 'UPLOAD'
        return 'INFO'
    
    def read_serial():
        nonlocal ser, monitoring
        while monitoring:
            try:
                if ser is None:
                    try:
                        ser = serial.Serial(PORT, BAUD, timeout=0.5)
                        append(f'Port {PORT} opened, waiting...', 'BOOT')
                        for _ in range(80):
                            if not monitoring: break
                            if ser.in_waiting > 0: break
                            time.sleep(0.1)
                    except serial.SerialException as e:
                        append(f'Cannot open {PORT}: {e}', 'ERROR')
                        time.sleep(2)
                        continue
    
                if ser.in_waiting > 0:
                    data = ser.read(ser.in_waiting)
                    try:
                        text = data.decode('utf-8', errors='replace')
                    except:
                        text = data.decode('latin-1', errors='replace')
                    text = text.replace('\r', '')
                    for line in text.split('\n'):
                        line = line.strip()
                        if line:
                            tag = detect_tag(line)
                            append(line, tag)
                else:
                    time.sleep(0.05)
            except Exception as e:
                append(f'Error: {e}', 'ERROR')
                time.sleep(1)
    
    def upload_workflow():
        nonlocal ser, monitoring
        try:
            set_status('[1/3] Killing old processes...')
            append('=== Firmware Upload + Serial Monitor ===', 'BOOT')
            append(f'Firmware: {FIRMWARE_DIR}', 'INFO')
            append(f'Log file: {LOG_FILE}', 'INFO')
            time.sleep(0.5)
    
            set_status('[2/3] Uploading firmware...')
            append('>>> Uploading firmware...', 'UPLOAD')
            
            if not upload_firmware(FIRMWARE_DIR, append):
                set_status('[Failed] Upload error')
                return
    
            append('Upload OK, board rebooting...', 'UPLOAD')
            time.sleep(0.5)
    
            set_status('[3/3] Starting serial monitor...')
            append('>>> Starting serial monitor...', 'UPLOAD')
    
            monitoring = True
            threading.Thread(target=read_serial, daemon=True).start()
            set_status(f'[Monitoring] {PORT} @ {BAUD} baud')
    
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
        nonlocal monitoring
        monitoring = False
        if ser:
            try: ser.close()
            except: pass
        root.destroy()
    
    root.protocol('WM_DELETE_WINDOW', on_closing)
    
    append('Starting...', 'BOOT')
    threading.Thread(target=upload_workflow, daemon=True).start()
    root.mainloop()

if __name__ == '__main__':
    if CLI_MODE:
        cli_mode()
    else:
        gui_mode()
