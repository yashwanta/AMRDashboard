$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Dashboard = Join-Path $Root "dashboard"
Set-Location $Dashboard
python -m http.server 8080

