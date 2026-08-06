# -*- coding: utf-8 -*-
"""
sEMG Git Push Tool (All-in-One)
Usage:
  - Double-click .pyw file: GUI mode (no console window)
  - Command line with --cli: CLI mode (no GUI, output to console)
  - AI Agent trigger: GUI mode (launched via os.startfile() or pythonw)
"""
import os
import sys
import time

# Check mode
CLI_MODE = '--cli' in sys.argv
RETRO_MODE = '--retroactive' in sys.argv

# Parse optional commit ref for retroactive mode
_retro_idx = None
RETRO_COMMIT = "HEAD"
for i, arg in enumerate(sys.argv):
    if arg == '--retroactive':
        _retro_idx = i
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--'):
            RETRO_COMMIT = sys.argv[i + 1]
        break

# GUI mode imports (skip for CLI / retroactive modes)
if not CLI_MODE and not RETRO_MODE:
    from tkinter import *
    from tkinter import scrolledtext
    import threading

import subprocess
import argparse
from datetime import datetime
from pathlib import Path

# --- Config ---
DEFAULT_PROJECT = Path(r"E:\sEMG_B_Project")
PROJECT_DIR = DEFAULT_PROJECT
GIT_EXE = r"C:\Git\cmd\git.exe"
PROXY = "http://shproxy.asrmicro.com:80"
REMOTE = "origin"
BRANCH = "main"

LOG_DIR = Path(r"E:\sEMG_B_Project\logs\git")
os.makedirs(LOG_DIR, exist_ok=True)

def kill_previous():
    """Kill old pythonw.exe processes running the same script."""
    my_pid = os.getpid()
    my_script = os.path.basename(__file__)
    try:
        # Kill all pythonw.exe processes running the same script
        subprocess.run(
            ['powershell', '-Command',
             f'$procs = Get-CimInstance Win32_Process -Filter "Name like \'pythonw%.exe\'";'
             f'foreach ($p in $procs) {{ if ($p.ProcessId -ne {my_pid} -and $p.CommandLine -like "*{my_script}*") {{ Stop-Process -Id $p.ProcessId -Force; Write-Host "Killed old process: $($p.ProcessId)" }} }}'],
            capture_output=True, text=True)
        time.sleep(1)  # Wait for processes to fully terminate
    except Exception as e:
        print(f'kill_previous error: {e}')

ts_str = time.strftime('%Y%m%d_%H%M%S')
LOG_FILE = LOG_DIR / f'git_push_{ts_str}.txt'

def log_msg(msg):
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = time.strftime('%H:%M:%S')
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f'[{ts}] {msg}\n')

def run_git(*args, check=True, capture=True, cwd=None):
    """Run a git command and return result."""
    cmd = [GIT_EXE] + list(args)
    work_dir = str(cwd or PROJECT_DIR)
    env = os.environ.copy()
    if capture:
        result = subprocess.run(
            cmd, cwd=work_dir, env=env, capture_output=True,
            text=True, encoding='utf-8', errors='replace'
        )
        return result
    else:
        result = subprocess.run(cmd, cwd=work_dir, env=env)
        return result


def _decode_git_quoted_path(s):
    """Decode Git's octal-escaped path (e.g. \\345\\237\\242 -> UTF-8 Chinese).

    Git uses C-style octal escapes for non-ASCII bytes when core.quotepath is on.
    This converts them back to proper Unicode strings.
    """
    import re

    def _replace_octal(m):
        return bytes(int(oct_str, 8) for oct_str in m.group(1).split('\\')).decode('utf-8', errors='replace')

    # Match quoted paths: "...\ooo\ooo\ooo..." or unquoted \ooo sequences
    # Git porcelain v1 outputs: "path" with internal \ooo escapes
    s = re.sub(r'((?:\\[0-7]{3})+)', _replace_octal, s)
    return s


# Status code display labels (A/D/M/R/C/U/...)
_STATUS_LABELS = {
    'A': 'Added',
    'D': 'Deleted',
    'M': 'Modified',
    'R': 'Renamed',
    'C': 'Copied',
    'U': 'Unmerged',
    'T': 'Type-changed',
}


def group_status_lines(lines):
    """Group git status lines by status code, preserving first-seen order.

    Returns list of (code, label, [lines]) tuples, e.g.
    [('M', 'Modified', ['M\\tfoo', ...]), ('A', 'Added', ['A\\tbar', ...])]
    """
    groups = {}
    order = []
    for line in lines:
        code = line[0] if line else '?'
        if code not in groups:
            groups[code] = []
            order.append(code)
        groups[code].append(line)
    result = []
    for code in order:
        label = _STATUS_LABELS.get(code, code)
        result.append((code, label, groups[code]))
    return result

def set_proxy():
    """Set temporary HTTP proxy for GitHub access."""
    run_git("config", "--global", "http.proxy", PROXY, check=False)
    return "Set proxy: " + PROXY

def clear_proxy():
    """Clear proxy settings after push."""
    run_git("config", "--global", "--unset", "http.proxy", check=False)
    run_git("config", "--global", "--unset", "https.proxy", check=False)
    return "Cleared proxy"

def get_status():
    """Get git status with proper UTF-8 Chinese filename decoding."""
    # -c core.quotepath=false tells Git to output raw UTF-8 instead of octal escapes
    result = run_git("-c", "core.quotepath=false", "status", "--porcelain", "--short")
    if result.returncode != 0:
        return []
    lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
    # Fallback: decode any remaining octal escapes (Git may still quote in some locales)
    lines = [_decode_git_quoted_path(l) for l in lines]
    return lines

def get_remote_url():
    """Get remote repository URL."""
    result = run_git("remote", "get-url", "origin")
    if result.returncode == 0:
        return result.stdout.strip()
    return None

def git_add(paths=None):
    """Stage files."""
    if paths:
        for p in paths:
            run_git("add", p)
    else:
        run_git("add", "-A")

def git_commit(message):
    """Commit staged changes."""
    result = run_git("commit", "-m", message)
    return result.returncode == 0

def git_push():
    """Push to remote. Returns (success, error_message)."""
    result = run_git("push", REMOTE, BRANCH, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "Unknown error"
        return False, err
    return True, ""

def auto_message():
    """Generate auto commit message."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"chore: {now} auto commit"


def retroactive_log(commit_ref="HEAD"):
    """Generate a log entry from an existing commit (for manual git operations).

    When git commands are run manually (bypassing this skill's workflow),
    call this to reconstruct a proper log file so logs/git/ stays complete.

    Args:
        commit_ref: Git ref (default "HEAD" for most recent commit).

    Returns:
        Path to the generated log file, or None on error.
    """
    # Get commit metadata
    info_result = run_git(
        "-c", "core.quotepath=false",
        "log", "-1", "--format=%H%n%ai%n%s%n%b", commit_ref
    )
    if info_result.returncode != 0 or not info_result.stdout.strip():
        print(f'Error: cannot read commit "{commit_ref}"')
        return None

    lines = info_result.stdout.strip().split('\n')
    commit_hash = lines[0] if len(lines) > 0 else "unknown"
    commit_date = lines[1] if len(lines) > 1 else ""
    subject = lines[2] if len(lines) > 2 else "(no subject)"

    # Parse date for filename
    try:
        dt = datetime.strptime(commit_date[:19], "%Y-%m-%d %H:%M:%S")
        ts_str = dt.strftime('%Y%m%d_%H%M%S')
    except ValueError:
        ts_str = time.strftime('%Y%m%d_%H%M%S')

    # Get file changes with proper encoding
    diff_result = run_git(
        "-c", "core.quotepath=false",
        "show", "--name-status", "--format=", commit_ref
    )
    if diff_result.returncode == 0:
        file_lines = [_decode_git_quoted_path(l)
                      for l in diff_result.stdout.strip().split('\n') if l.strip()]
    else:
        # Fallback: use diff-tree
        diff_result = run_git(
            "-c", "core.quotepath=false",
            "diff-tree", "--name-status", "-r", commit_ref
        )
        file_lines = [_decode_git_quoted_path(l)
                      for l in diff_result.stdout.strip().split('\n') if l.strip()]

    # Write log file
    retro_log_file = LOG_DIR / f'git_push_{ts_str}.txt'
    # Avoid overwriting existing log
    if retro_log_file.exists():
        base = str(retro_log_file)
        counter = 1
        while retro_log_file.exists():
            retro_log_file = Path(f'{base}_retro{counter}.txt')
            counter += 1

    with open(retro_log_file, 'w', encoding='utf-8') as f:
        f.write(f'[RETROACTIVE] === Git Push Log (reconstructed) ===\n')
        f.write(f'[RETROACTIVE] Commit: {commit_hash}\n')
        f.write(f'[RETROACTIVE] Date:   {commit_date}\n')
        f.write(f'[RETROACTIVE] Subject: {subject}\n')
        f.write(f'[RETROACTIVE] Project: {PROJECT_DIR}\n')
        remote_url = get_remote_url()
        if remote_url:
            f.write(f'[RETROACTIVE] Remote: {remote_url}\n')
        f.write(f'[RETROACTIVE] Changes: {len(file_lines)} file(s)\n')
        for code, label, glines in group_status_lines(file_lines):
            f.write(f'[RETROACTIVE]   [{label}] {len(glines)} file(s)\n')
            for fl in glines:
                f.write(f'[RETROACTIVE]     {fl}\n')
        f.write(f'[RETROACTIVE] Push:   SUCCESS (assumed)\n')
        f.write(f'[RETROACTIVE] Note:   This log was reconstructed post-hoc from commit {commit_ref[:7]}\n')

    print(f'Retroactive log written: {retro_log_file}')
    return retro_log_file

def cli_mode():
    """Command-line mode"""
    print('=== sEMG Git Push Tool (CLI) ===')
    print()
    
    # Show remote URL
    remote_url = get_remote_url()
    if remote_url:
        print(f'Remote: {remote_url}')
    else:
        print('Remote: (not configured)')
    print()
    
    # Check changes
    lines = get_status()
    if not lines:
        print('No changes detected. Nothing to commit.')
        sys.exit(0)
    
    print(f'Changes: {len(lines)} file(s)')
    for code, label, glines in group_status_lines(lines):
        print(f'  [{label}] {len(glines)} file(s)')
        for line in glines[:10]:
            print(f'    {line}')
        if len(glines) > 10:
            print(f'    ... and {len(glines) - 10} more')
    
    print()
    print('[1/5] Setting proxy...')
    set_proxy()
    
    print('[2/4] Adding files...')
    git_add()
    
    print('[3/4] Committing...')
    message = auto_message()
    if not git_commit(message):
        print('Commit failed!')
        clear_proxy()
        sys.exit(1)
    
    print(f'  Message: {message}')
    print('[4/4] Pushing...')
    
    success, err_msg = git_push()
    if success:
        print('  Push SUCCESS!')
        if remote_url:
            print(f'  Repository: {remote_url}')
    else:
        print(f'  Push FAILED!')
        for line in err_msg.split('\n'):
            print(f'    {line}')
    
    clear_proxy()
    print()
    print('Done!')

def gui_mode():
    """GUI mode"""
    # Kill old processes first
    kill_previous()
    
    root = Tk()
    root.title(f'sEMG Git Push Tool - {ts_str}')
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
    txt.tag_config('GIT', foreground='#00aaff')
    
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
    
    def push_workflow():
        try:
            set_status('[1/5] Checking changes...')
            append('=== Git Push Tool ===', 'BOOT')
            append(f'Project: {PROJECT_DIR}', 'INFO')
            
            # Get and display remote URL
            remote_url = get_remote_url()
            if remote_url:
                append(f'Remote: {remote_url}', 'INFO')
            else:
                append('Remote: (not configured)', 'WARN')
            
            lines = get_status()
            if not lines:
                append('No changes detected. Nothing to commit.', 'WARN')
                set_status('[Done] No changes')
                return

            append(f'Changes: {len(lines)} file(s)', 'INFO')
            for code, label, glines in group_status_lines(lines):
                append(f'  [{label}] {len(glines)} file(s)', 'GIT')
                for line in glines[:15]:
                    append(f'    {line}', 'GIT')
                if len(glines) > 15:
                    append(f'    ... and {len(glines) - 15} more', 'GIT')
            
            set_status('[2/5] Setting proxy...')
            msg = set_proxy()
            append(msg, 'GIT')
            
            set_status('[3/5] Committing...')
            git_add()
            message = auto_message()
            if git_commit(message):
                append(f'Committed: {message}', 'GIT')
            else:
                append('Commit failed!', 'ERROR')
                clear_proxy()
                set_status('[Failed] Commit error')
                return
            
            set_status('[4/5] Pushing...')
            success, err_msg = git_push()
            if success:
                append('Push SUCCESS!', 'GIT')
                append(f'Repository: {remote_url}', 'INFO')
                set_status('[Success] Pushed to remote')
            else:
                append('Push FAILED!', 'ERROR')
                for line in err_msg.split('\n'):
                    append(f'  {line}', 'ERROR')
                set_status('[Failed] Push error')
            
            clear_proxy()
            append('Proxy cleared.', 'GIT')
            
        except Exception as e:
            append(f'ERROR: {e}', 'ERROR')
            set_status('[Failed]')
            try:
                clear_proxy()
            except:
                pass
    
    bottom_frame = Frame(root, bg='#1a1a2e', pady=5)
    bottom_frame.pack(fill='x')
    
    def open_logs():
        os.startfile(LOG_DIR)
    
    Button(bottom_frame, text='[Folder] Open Logs', command=open_logs,
           font='Consolas 9', bg='#2d2d4a', fg='white', relief='flat', padx=10).pack(side='left', padx=10)
    
    Label(bottom_frame, text=str(LOG_FILE),
          bg='#1a1a2e', fg='#888', font='Consolas 8').pack(side='right', padx=10)
    
    def on_closing():
        root.destroy()
    
    root.protocol('WM_DELETE_WINDOW', on_closing)
    
    append('Starting...', 'BOOT')
    threading.Thread(target=push_workflow, daemon=True).start()
    root.mainloop()

if __name__ == '__main__':
    if RETRO_MODE:
        retroactive_log(RETRO_COMMIT)
    elif CLI_MODE:
        cli_mode()
    else:
        gui_mode()
