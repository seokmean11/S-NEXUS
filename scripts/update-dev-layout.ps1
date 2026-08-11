# 조직관리 · 사업본부별 급수 구성비 2열 레이아웃 반영
Set-Location $PSScriptRoot\..

Write-Host "=== Git pull ===" -ForegroundColor Cyan
git pull origin main

Write-Host "`n=== Latest commit (e7ee6c2 이상이어야 함) ===" -ForegroundColor Cyan
git log -1 --oneline

Write-Host "`n=== Layout CSS check ===" -ForegroundColor Cyan
Select-String -Path src\styles\global.css -Pattern "division-charts-row" | Select-Object -First 3

Write-Host "`n완료. dev 서버 재시작 후 Ctrl+Shift+R 로 새로고침하세요." -ForegroundColor Green
