@echo off
title sEMG Firmware Tool
cd /d "%~dp0"
python "%~dp0firmware_upload.py"
pause
