#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
workflow: sEMG 组合工作流工具Usage:
  - Double-click .pyw file: run firmware-upload + miniprogram-upload in parallel
  - Command line: python workflow.pyw --cli [firmware_dir] [project_dir]

Args:
  firmware_dir: 固件目录 (default: E:\sEMG_B_Project\firmware)
  project_dir:  项目根目录 (default: E:\sEMG_B_Project)

Examples:
  pythonw workflow.pyw
  pythonw workflow.pyw --cli
  pythonw workflow.pyw --cli E:\fw E:\project
"""
import os
import sys
import time
import subprocess
from pathlib import Path

# ==================== Default paths ====================
# firmware-upload expects: firmware directory (e.g. E:\sEMG_B_Project\firmware)
# miniprogram-upload expects: project root directory (e.g. E:\sEMG_B_Project)
DEFAULT_PROJECT_DIR  = r"E:\sEMG_B_Project"
DEFAULT_FIRMWARE_DIR = DEFAULT_PROJECT_DIR + r"\firmware"

# Skills dir is always E:\sEMG_B_Project\skills\
SKILLS_DIR = Path(__file__).parent.parent  # E:\sEMG_B_Project\skills\ (parent of workflow)

# Skill scripts
FIRMWARE_UPLOAD_SCRIPT    = SKILLS_DIR / "firmware-upload" / "firmware_upload.pyw"
MINIPROGRAM_UPLOAD_SCRIPT = SKILLS_DIR / "miniprogram-upload" / "miniprogram_upload.pyw"

CLI_MODE = '--cli' in sys.argv


def get_pythonw():
    pythonw = sys.executable.replace("python.exe", "pythonw.exe")
    if not os.path.exists(pythonw):
        pythonw = sys.executable
    return pythonw


def run_workflow(firmware_dir, project_dir):
    """Run firmware-upload first, then miniprogram-upload.
    Both have their own GUI windows.
    """
    # Find pythonw.exe path
    python = sys.executable
    if 'pythonw' not in python.lower():
        python = python.replace('python.exe', 'pythonw.exe')
    if not os.path.exists(python):
        python = sys.executable

    print("=" * 60)
    print("  sEMG Workflow - Deploy")
    print("=" * 60)
    print(f"  Firmware dir:  {firmware_dir}")
    print(f"  Project dir:   {project_dir}")
    print("=" * 60)

    # Get current process ID so we don't kill ourselves
    current_pid = os.getpid()

    # Clean up any lingering pio processes (NOT our own python processes!)
    try:
        subprocess.run(
            ['powershell', '-Command',
             'Get-Process pio,platformio -ErrorAction SilentlyContinue | Stop-Process -Force'],
            capture_output=True, timeout=10)
        time.sleep(1)
    except Exception:
        pass

    # Step 1: Start firmware-upload
    print("\n  [1/2] Starting firmware-upload...")
    subprocess.Popen(
        [python, str(FIRMWARE_UPLOAD_SCRIPT), firmware_dir],
        cwd=str(SKILLS_DIR / "firmware-upload")
    )
    
    print("        (firmware tool window opened, waiting 10s...)")
    time.sleep(10)  # Wait for upload to finish

    # Step 2: Start miniprogram-upload
    print("\n  [2/2] Starting miniprogram-upload...")
    subprocess.Popen(
        [python, str(MINIPROGRAM_UPLOAD_SCRIPT), project_dir],
        cwd=str(SKILLS_DIR / "miniprogram-upload")
    )

    print("\n" + "=" * 60)
    print("  [OK] Workflow started!")
    print("=" * 60)
    print("\n  Windows:")
    print("    - sEMG Firmware Tool (serial monitor)")
    print("    - sEMG Mini Program Tool (log server)")


def cli_mode():
    """Command-line mode"""
    args = [a for a in sys.argv[1:] if a != '--cli']
    if args:
        firmware_dir = args[0]
        project_dir = args[1] if len(args) > 1 else DEFAULT_PROJECT_DIR
    else:
        firmware_dir = DEFAULT_FIRMWARE_DIR
        project_dir = DEFAULT_PROJECT_DIR
    run_workflow(firmware_dir, project_dir)


if __name__ == "__main__":
    if CLI_MODE:
        cli_mode()
    else:
        # Double-click mode: just start both skills, no extra GUI
        run_workflow(DEFAULT_FIRMWARE_DIR, DEFAULT_PROJECT_DIR)
