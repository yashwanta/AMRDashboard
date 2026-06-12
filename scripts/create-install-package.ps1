param(
    [string]$OutputDir = "packages",
    [switch]$IncludeImages
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$PackageName = "robowatch-install-$Stamp"
$PackageRoot = Join-Path $Root $OutputDir
$Stage = Join-Path $PackageRoot $PackageName

function Copy-RepoItem([string]$RelativePath) {
    $source = Join-Path $Root $RelativePath
    $dest = Join-Path $Stage $RelativePath
    if (-not (Test-Path $source)) {
        return
    }
    $parent = Split-Path -Parent $dest
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -Path $source -Destination $dest -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $PackageRoot | Out-Null
if (Test-Path $Stage) {
    Remove-Item -LiteralPath $Stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

$items = @(
    "backend",
    "frontend",
    "scripts",
    "docs",
    "docker-compose.yml",
    "INSTALL.md",
    "README.md"
)

foreach ($item in $items) {
    Copy-RepoItem $item
}

$junk = @(
    "frontend\node_modules",
    "frontend\dist",
    "frontend\vite-dev.err.log",
    "frontend\vite-dev.out.log",
    "backend\.gocache",
    "scripts\__pycache__"
)
foreach ($path in $junk) {
    $target = Join-Path $Stage $path
    if (Test-Path $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

Get-ChildItem -Path $Stage -Recurse -Include "*.pyc", "*.pyo" -ErrorAction SilentlyContinue | Remove-Item -Force

if ($IncludeImages) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        throw "Docker is required for -IncludeImages."
    }
    docker build -t robowatch-backend:latest -f (Join-Path $Root "backend\Dockerfile") (Join-Path $Root "backend")
    docker build -t robowatch-frontend:latest -f (Join-Path $Root "frontend\Dockerfile") (Join-Path $Root "frontend")
    $imageDir = Join-Path $Stage "images"
    New-Item -ItemType Directory -Force -Path $imageDir | Out-Null
    docker save -o (Join-Path $imageDir "robowatch-images.tar") robowatch-backend:latest robowatch-frontend:latest postgres:16-alpine
}

$zipPath = Join-Path $PackageRoot "$PackageName.zip"
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $zipPath -Force

$tarPath = Join-Path $PackageRoot "$PackageName.tar.gz"
if (Get-Command tar -ErrorAction SilentlyContinue) {
    if (Test-Path $tarPath) {
        Remove-Item -LiteralPath $tarPath -Force
    }
    Push-Location $Stage
    try {
        tar -czf $tarPath .
    } finally {
        Pop-Location
    }
}

Write-Host "Install package created:" -ForegroundColor Green
Write-Host "  $zipPath"
if (Test-Path $tarPath) {
    Write-Host "  $tarPath"
}
Write-Host ""
Write-Host "Copy the archive to the target server, extract it, then run:"
Write-Host "  Linux:   sudo bash scripts/install-linux-docker.sh"
Write-Host "  Windows: powershell -ExecutionPolicy Bypass -File scripts\install-windows-docker.ps1"
