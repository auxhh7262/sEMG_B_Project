# 修复 sEMG Skills
Copy-Item "E:\Backup\sEMG_A_Project\skills\firmware-upload\serial_monitor.py" "E:\skills\firmware-upload\serial_monitor.py" -Force
Copy-Item "E:\Backup\sEMG_A_Project\skills\firmware-upload\upload_and_monitor.py" "E:\skills\firmware-upload\upload_and_monitor.py" -Force
Copy-Item "E:\Backup\sEMG_A_Project\skills\firmware-upload\USAGE.md" "E:\skills\firmware-upload\USAGE.md" -Force
Write-Host "[OK] firmware-upload"

Copy-Item "E:\Backup\sEMG_A_Project\skills\miniprogram-preview\mini_log_server.py" "E:\skills\miniprogram-upload\mini_log_server.py" -Force
Copy-Item "E:\Backup\sEMG_A_Project\skills\miniprogram-preview\preview.py" "E:\skills\miniprogram-upload\preview.py" -Force
Copy-Item "E:\Backup\sEMG_A_Project\skills\miniprogram-preview\USAGE.md" "E:\skills\miniprogram-upload\USAGE.md" -Force
Write-Host "[OK] miniprogram-upload"

if (Test-Path "E:\skills\log-analyze") {
    Rename-Item "E:\skills\log-analyze" "E:\skills\semg-logs"
    Write-Host "[OK] log-analyze -> semg-logs"
}

Copy-Item "E:\Backup\sEMG_A_Project\skills\semg-workflow\SKILL.md" "E:\skills\semg-workflow\SKILL.md" -Force
Copy-Item "E:\Backup\sEMG_A_Project\skills\semg-workflow\USAGE.md" "E:\skills\semg-workflow\USAGE.md" -Force
Write-Host "[OK] semg-workflow"

Write-Host "所有修复完成！"
