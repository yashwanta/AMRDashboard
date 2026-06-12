param(
    [int]$AppPort = 3000,
    [string]$ConnectAddress = "127.0.0.1",
    [int]$ConnectPort = 3000,
    [string[]]$ListenAddress = @(),
    [string[]]$ExcludePrefix = @("192.168.1."),
    [switch]$NoSelfElevate
)

$ErrorActionPreference = "Stop"

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        if (-not $NoSelfElevate) {
            $args = @(
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", $PSCommandPath,
                "-AppPort", "$AppPort",
                "-ConnectAddress", $ConnectAddress,
                "-ConnectPort", "$ConnectPort",
                "-NoSelfElevate"
            )
            foreach ($ip in $ListenAddress) {
                $args += @("-ListenAddress", $ip)
            }
            foreach ($prefix in $ExcludePrefix) {
                $args += @("-ExcludePrefix", $prefix)
            }
            Write-Host "Requesting Administrator permission to configure Windows port forwarding..." -ForegroundColor Yellow
            Start-Process powershell.exe -Verb RunAs -ArgumentList $args -Wait
            exit 0
        }
        throw "Run PowerShell as Administrator, then run this script again."
    }
}

function Test-ExcludedIP([string]$IP) {
    foreach ($prefix in $ExcludePrefix) {
        if (-not [string]::IsNullOrWhiteSpace($prefix) -and $IP.StartsWith($prefix)) {
            return $true
        }
    }
    return $false
}

function Get-LanIPv4 {
    $ipconfig = ipconfig
    foreach ($line in $ipconfig) {
        if ($line -match "IPv4 Address[.\s]*:\s*([0-9.]+)") {
            $ip = $Matches[1]
            if ($ip -notlike "127.*" -and $ip -notlike "169.254.*" -and -not (Test-ExcludedIP $ip)) {
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
    throw "No allowed LAN IPv4 address was found. Pass -ListenAddress YOUR_SERVER_IP manually."
}

$excluded = @($ListenAddress | Where-Object { Test-ExcludedIP $_ })
if ($excluded.Count -gt 0) {
    throw "Refusing to publish on excluded IP(s): $($excluded -join ', '). Remove -ExcludePrefix or pass a different -ListenAddress if this is intentional."
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
