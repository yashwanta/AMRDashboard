param(
    [string]$OutputDir = "packages",
    [switch]$IncludeImages,
    [switch]$Protected,
    [switch]$UseExistingImages
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$PackageName = "robowatch-install-$Stamp"
if ($Protected) {
    $PackageName = "drishti-siteops-runtime-$Stamp"
    $IncludeImages = $true
}
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

function Get-ContainerRuntime {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        return "docker"
    }

    $podman = Get-Command podman -ErrorAction SilentlyContinue
    if ($podman) {
        return "podman"
    }

    throw "Docker or Podman is required for -IncludeImages."
}

New-Item -ItemType Directory -Force -Path $PackageRoot | Out-Null
if (Test-Path $Stage) {
    Remove-Item -LiteralPath $Stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

if ($Protected) {
    $items = @(
        "scripts",
        "docs",
        "INSTALL.md",
        "README.md"
    )
} else {
    $items = @(
        "backend",
        "frontend",
        "scripts",
        "docs",
        "docker-compose.yml",
        "INSTALL.md",
        "README.md"
    )
}

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
    $runtime = Get-ContainerRuntime
    if ($UseExistingImages) {
        Write-Host "Using existing bundled container images with $runtime..." -ForegroundColor Cyan
    } else {
        Write-Host "Building bundled container images with $runtime..." -ForegroundColor Cyan
        & $runtime build -t robowatch-backend:latest -f (Join-Path $Root "backend\Dockerfile") (Join-Path $Root "backend")
        & $runtime build -t robowatch-frontend:latest -f (Join-Path $Root "frontend\Dockerfile") (Join-Path $Root "frontend")
    }
    $imageDir = Join-Path $Stage "images"
    New-Item -ItemType Directory -Force -Path $imageDir | Out-Null
    & $runtime save -o (Join-Path $imageDir "robowatch-images.tar") robowatch-backend:latest robowatch-frontend:latest postgres:16-alpine
}

if ($Protected) {
    @'
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-amr}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-amr}
      POSTGRES_DB: ${POSTGRES_DB:-amrdashboard}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U amr -d amrdashboard"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    image: ${BACKEND_IMAGE:-robowatch-backend:latest}
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-amr}:${POSTGRES_PASSWORD:-amr}@postgres:5432/${POSTGRES_DB:-amrdashboard}?sslmode=disable
      SERVER_PORT: 8080
      ENCRYPTION_KEY: ${ENCRYPTION_KEY:-change-this-32-byte-secret-key!!}
      SESSION_SECRET: ${SESSION_SECRET:-change-this-session-secret!!}
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-admin}
      ALLOW_CUSTOM_COMMANDS: ${ALLOW_CUSTOM_COMMANDS:-false}
      SCHEDULE_AM: "0 6 * * *"
      SCHEDULE_PM: "0 18 * * *"
      SYNC_ON_STARTUP: ${SYNC_ON_STARTUP:-true}
      SYNC_STARTUP_DELAY_SECONDS: ${SYNC_STARTUP_DELAY_SECONDS:-20}
    ports:
      - "${API_PORT:-8080}:8080"

  frontend:
    image: ${FRONTEND_IMAGE:-robowatch-frontend:latest}
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "${APP_PORT:-3000}:80"

volumes:
  pgdata:
'@ | Set-Content -Path (Join-Path $Stage "docker-compose.yml") -Encoding ASCII

    @"
DRISHTI SiteOps runtime package
================================

This package is intended for installation on another computer without shipping the application source code.

Included:
- Installer scripts
- Documentation
- Prebuilt container images in images\robowatch-images.tar
- Runtime-only docker-compose.yml

Not included:
- backend Go source code
- frontend React/TypeScript source code
- Git history
- developer workspace files

Security note:
This protects your source from casual copying. It does not make reverse engineering impossible because any deployed application can be inspected at some level.
"@ | Set-Content -Path (Join-Path $Stage "RUNTIME_PACKAGE_README.txt") -Encoding ASCII
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
