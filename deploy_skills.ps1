# 复制合并后的 SKILL.md 到各个 skill 目录
Write-Host "开始复制合并后的文档..."

# 1. firmware-upload
Copy-Item "E:\sEMG_B_Project\temp_skill_md\firmware-upload.md" "E:\skills\firmware-upload\SKILL.md" -Force
Remove-Item "E:\skills\firmware-upload\USAGE.md" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] firmware-upload 文档合并完成"

# 2. miniprogram-upload
Copy-Item "E:\sEMG_B_Project\temp_skill_md\miniprogram-preview.md" "E:\skills\miniprogram-upload\SKILL.md" -Force
Remove-Item "E:\skills\miniprogram-upload\USAGE.md" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] miniprogram-upload 文档合并完成"

# 3. git-push
Copy-Item "E:\sEMG_B_Project\temp_skill_md\git-push.md" "E:\skills\git-push\SKILL.md" -Force
Remove-Item "E:\skills\git-push\USAGE.md" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] git-push 文档合并完成"

# 4. semg-logs
Copy-Item "E:\sEMG_B_Project\temp_skill_md\semg-logs.md" "E:\skills\semg-logs\SKILL.md" -Force
Write-Host "[OK] semg-logs 文档合并完成"

# 5. semg-workflow
Copy-Item "E:\sEMG_B_Project\temp_skill_md\semg-workflow.md" "E:\skills\semg-workflow\SKILL.md" -Force
Remove-Item "E:\skills\semg-workflow\USAGE.md" -Force -ErrorAction SilentlyContinue
Write-Host "[OK] semg-workflow 文档合并完成"

# 清理临时文件
Remove-Item "E:\sEMG_B_Project\temp_skill_md" -Recurse -Force
Write-Host "[OK] 临时文件已清理"

Write-Host ""
Write-Host "========================================"
Write-Host "所有文档合并完成！"
Write-Host "========================================"
Write-Host ""
Write-Host "已完成的操作："
Write-Host "1. 恢复了所有缺失的 Python 脚本文件"
Write-Host "2. 合并了 SKILL.md + USAGE.md 为统一文档"
Write-Host "3. 重命名了 log-analyze 为 semg-logs"
Write-Host "4. 删除了重复的 USAGE.md 文件"
Write-Host ""
Write-Host "建议：请重启 TRAE IDE 以使权限生效"
