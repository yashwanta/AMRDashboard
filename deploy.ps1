# AMR Dashboard - Fast Deploy
# Usage: .\deploy.ps1
# Usage: .\deploy.ps1 -Clean   (full rebuild, slower)

param([switch]$Clean)

Set-Location $PSScriptRoot

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git add -A
$msg = "deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $msg
git push origin main

Write-Host "Building containers..." -ForegroundColor Cyan
if ($Clean) {
    python -m podman_compose build --no-cache
} else {
    python -m podman_compose build
}

Write-Host "Restarting..." -ForegroundColor Cyan
python -m podman_compose down
python -m podman_compose up -d

Write-Host "Done -> http://localhost:3000" -ForegroundColor Green
Start-Process "http://localhost:3000"
