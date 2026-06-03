param(
  [string]$HostAddress = "0.0.0.0",
  [int]$Port = 8885,
  [string]$User = "admin",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $Password) {
  $Password = if ($env:AMR_DASH_PASSWORD) { $env:AMR_DASH_PASSWORD } else { "admin123" }
}

$env:AMR_DASH_USER = $User
$env:AMR_DASH_PASSWORD = $Password

python (Join-Path $Root "scripts\serve-login.py") --host $HostAddress --port $Port --user $User --password $Password

