# 部署合并后的 firmware_upload.py
Write-Host "部署 firmware_upload.py..."

# 复制新文件
Copy-Item "E:\sEMG_B_Project\temp_skill_md\firmware_upload.py" "E:\skills\firmware-upload\firmware_upload.py" -Force
Write-Host "[OK] firmware_upload.py 已更新"

# 删除旧文件
$oldFiles = @("upload_and_monitor.py", "serial_monitor.py")
foreach ($f in $oldFiles) {
    $path = Join-Path "E:\skills\firmware-upload" $f
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "[OK] 已删除: $f"
    }
}

# 清理临时文件
Remove-Item "E:\sEMG_B_Project\temp_skill_md" -Recurse -Force
Write-Host "[OK] 临时文件已清理"

Write-Host ""
Write-Host "========================================"
Write-Host "部署完成！"
Write-Host "========================================"
Write-Host ""
Write-Host "E:\skills\firmware-upload\ 现在只有："
Write-Host "  - firmware_upload.py  (合并后的单文件)"
Write-Host "  - SKILL.md"
Write-Host ""
Write-Host "运行方式："
Write-Host "  python E:\skills\firmware-upload\firmware_upload.py"
Write-Host ""
Write-Host "功能："
Write-Host "  1. 杀旧进程"
Write-Host "  2. 上传固件"
Write-Host "  3. 串口监控"
Write-Host "  - 全部在一个 tkinter GUI 窗口中显示"
