param(
  [string]$BaseUrl = "http://10.216.4.59:8080",
  [string]$Username = "amrdashboard",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $Password) {
  $Password = $env:RDS_PASSWORD
}
if (-not $Password) {
  throw "RDS password is required. Pass -Password or set RDS_PASSWORD."
}

python (Join-Path $Root "scripts\pull-rds-data.py") --base-url $BaseUrl --username $Username --password $Password --output (Join-Path $Root "dashboard\data\rds.json")
