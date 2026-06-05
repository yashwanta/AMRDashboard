# AMR Dashboard - One-click setup and start
# Right-click this file -> "Run with PowerShell"

Set-Location $PSScriptRoot
Write-Host "=== AMR Dashboard Setup ===" -ForegroundColor Cyan

# 1. Install podman-compose if missing
if (-not (Get-Command podman-compose -ErrorAction SilentlyContinue)) {
    Write-Host "Installing podman-compose..." -ForegroundColor Yellow
    if (Get-Command pip -ErrorAction SilentlyContinue) {
        pip install podman-compose
    } elseif (Get-Command pip3 -ErrorAction SilentlyContinue) {
        pip3 install podman-compose
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        python -m pip install podman-compose
    } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id Docker.DockerCompose
        Write-Host "Installed docker-compose via winget. Please restart PowerShell and re-run this script." -ForegroundColor Yellow
        pause; exit
    } else {
        Write-Host "ERROR: No package manager found (pip/winget). Please install Python first: https://python.org" -ForegroundColor Red
        pause; exit 1
    }
}

# 2. Copy .env if missing
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host ".env created from .env.example" -ForegroundColor Green
}

# 3. Build and start
Write-Host "Building containers (this takes a few minutes first time)..." -ForegroundColor Yellow
podman-compose build --no-cache
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; pause; exit 1 }

Write-Host "Starting containers..." -ForegroundColor Yellow
podman-compose up -d
if ($LASTEXITCODE -ne 0) { Write-Host "Start failed." -ForegroundColor Red; pause; exit 1 }

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API:       http://localhost:8080/api" -ForegroundColor Cyan
Write-Host ""
Start-Process "http://localhost:3000"
