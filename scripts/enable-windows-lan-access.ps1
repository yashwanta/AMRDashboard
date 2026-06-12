param(
    [int]$AppPort = 3000,
    [string]$ConnectAddress = "127.0.0.1",
    [int]$ConnectPort = 3000,
    [string[]]$ListenAddress = @()
)

$ErrorActionPreference = "Stop"

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run PowerShell as Administrator, then run this script again."
    }
}

function Get-LanIPv4 {
    $ipconfig = ipconfig
    foreach ($line in $ipconfig) {
        if ($line -match "IPv4 Address[.\s]*:\s*([0-9.]+)") {
            $ip = $Matches[1]
            if ($ip -notlike "127.*" -and $ip -notlike "169.254.*") {
                $ip
            }
        }
    }
}

Require-Admin

if ($ListenAddress.Count -eq 0) {
    $ListenAddress = @(Get-LanIPv4 | Select-Object -Unique)
}

if ($ListenAddress.Count -eq 0) {
    throw "No LAN IPv4 address was found. Pass -ListenAddress 192.168.x.x manually."
}

foreach ($ip in $ListenAddress) {
    Write-Host "Forwarding http://$ip`:$AppPort -> $ConnectAddress`:$ConnectPort" -ForegroundColor Cyan
    netsh interface portproxy delete v4tov4 listenaddress=$ip listenport=$AppPort 2>$null | Out-Null
    netsh interface portproxy add v4tov4 listenaddress=$ip listenport=$AppPort connectaddress=$ConnectAddress connectport=$ConnectPort
}

$ruleName = "RoboWatch Web $AppPort"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $AppPort | Out-Null
} else {
    Enable-NetFirewallRule -DisplayName $ruleName | Out-Null
}

Write-Host ""
Write-Host "RoboWatch LAN access is configured." -ForegroundColor Green
Write-Host "Browse from another computer using one of these URLs:"
foreach ($ip in $ListenAddress) {
    Write-Host "  http://$ip`:$AppPort" -ForegroundColor Green
}
Write-Host ""
Write-Host "Current portproxy rules:"
netsh interface portproxy show v4tov4
