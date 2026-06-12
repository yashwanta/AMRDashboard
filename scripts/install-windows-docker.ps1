param(
    [int]$AppPort = 3000,
    [int]$ApiPort = 8080,
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = "",
    [string]$InstallName = "robowatch",
    [switch]$AllowCustomCommands,
    [switch]$InstallDockerIfMissing
)

$ErrorActionPreference = "Stop"

function New-Secret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer)
}

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run PowerShell as Administrator, then run this installer again."
    }
}

function Ensure-Docker {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        return
    }

    if (-not $InstallDockerIfMissing) {
        throw "Docker was not found. Install Docker Desktop or rerun with -InstallDockerIfMissing."
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Docker is missing and winget is not available. Install Docker Desktop manually, then rerun this script."
    }

    Write-Host "Installing Docker Desktop with winget..." -ForegroundColor Yellow
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Write-Host "Docker Desktop was installed. Reboot or start Docker Desktop, then rerun this script." -ForegroundColor Yellow
    exit 0
}

function Ensure-DockerRunning {
    try {
        docker info | Out-Null
    } catch {
        throw "Docker is installed but not running. Start Docker Desktop or Docker Engine, then rerun this script."
    }
}

function Compose-Command {
    docker compose version | Out-Null
    return @("docker", "compose")
}

Require-Admin
Ensure-Docker
Ensure-DockerRunning

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $Root ".env"
$ImageBundle = Join-Path $Root "images\robowatch-images.tar"

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    $AdminPassword = New-Secret 18
}

$DbPassword = New-Secret 24
$EncryptionKey = New-Secret 32
$SessionSecret = New-Secret 32
$AllowCustom = if ($AllowCustomCommands) { "true" } else { "false" }

@"
COMPOSE_PROJECT_NAME=$InstallName
POSTGRES_USER=amr
POSTGRES_PASSWORD=$DbPassword
POSTGRES_DB=amrdashboard
APP_PORT=$AppPort
API_PORT=$ApiPort
BACKEND_IMAGE=robowatch-backend:latest
FRONTEND_IMAGE=robowatch-frontend:latest
ENCRYPTION_KEY=$EncryptionKey
SESSION_SECRET=$SessionSecret
ADMIN_USERNAME=$AdminUsername
ADMIN_PASSWORD=$AdminPassword
ALLOW_CUSTOM_COMMANDS=$AllowCustom
SCHEDULE_AM=0 6 * * *
SCHEDULE_PM=0 18 * * *
"@ | Set-Content -Path $EnvFile -Encoding ASCII

if (Test-Path $ImageBundle) {
    Write-Host "Loading bundled container images..." -ForegroundColor Cyan
    docker load -i $ImageBundle
    $BuildArg = @()
} else {
    $BuildArg = @("--build")
}

Write-Host "Starting RoboWatch with Docker Compose..." -ForegroundColor Cyan
$ComposeFile = Join-Path $Root "docker-compose.yml"
$ComposeArgs = @("compose", "-f", $ComposeFile, "up", "-d") + $BuildArg
& docker @ComposeArgs

$control = Join-Path $Root "robowatch-windows-control.ps1"
@"
param([ValidateSet('start','stop','restart','status','logs')] [string]`$Action = 'status')
`$Root = Split-Path -Parent `$MyInvocation.MyCommand.Path
switch (`$Action) {
  'start'   { docker compose -f "`$Root\docker-compose.yml" up -d }
  'stop'    { docker compose -f "`$Root\docker-compose.yml" stop }
  'restart' { docker compose -f "`$Root\docker-compose.yml" restart }
  'status'  { docker compose -f "`$Root\docker-compose.yml" ps }
  'logs'    { docker compose -f "`$Root\docker-compose.yml" logs --tail=200 }
}
"@ | Set-Content -Path $control -Encoding ASCII

Write-Host ""
Write-Host "RoboWatch installed." -ForegroundColor Green
Write-Host "  App:   http://localhost:$AppPort"
Write-Host "  API:   http://localhost:$ApiPort/api"
Write-Host "  Login: $AdminUsername / $AdminPassword"
Write-Host "  Env:   $EnvFile"
Write-Host ""
Write-Host "To allow other computers to browse the app, run PowerShell as Administrator:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\enable-windows-lan-access.ps1 -AppPort $AppPort"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\robowatch-windows-control.ps1 status"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\robowatch-windows-control.ps1 restart"
