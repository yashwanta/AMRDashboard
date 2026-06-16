$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$startScript = Join-Path $repoRoot "scripts\start-drishti-opsforge.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "Start Drishti OpsForge.cmd"

if (-not (Test-Path -LiteralPath $startScript)) {
  throw "Start script not found: $startScript"
}

$content = @"
@echo off
cd /d "$repoRoot"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$startScript"
"@

Set-Content -LiteralPath $startupFile -Value $content -Encoding ASCII

Write-Host "Created startup launcher:"
Write-Host $startupFile
Write-Host "Drishti OpsForge will start after this Windows user logs in."
