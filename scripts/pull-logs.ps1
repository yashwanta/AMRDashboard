param(
  [string]$RemoteHost = "10.216.4.59",
  [string]$User = "logpull",
  [string]$IdentityFile = "",
  [switch]$UseSudo
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ArchiveDir = Join-Path $Root "data\archives"
$ExtractDir = Join-Path $Root "data\logs"
$LatestDir = Join-Path $ExtractDir "latest"
$DashboardData = Join-Path $Root "dashboard\data"

New-Item -ItemType Directory -Force -Path $ArchiveDir, $ExtractDir, $DashboardData | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RemoteArchive = "/tmp/logpull-var-log-$Stamp.tgz"
$LocalArchive = Join-Path $ArchiveDir "var-log-$RemoteHost-$Stamp.tgz"

$sshArgs = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")
$scpArgs = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15")

if ($IdentityFile) {
  $sshArgs += @("-i", $IdentityFile)
  $scpArgs += @("-i", $IdentityFile)
}

$Target = "$User@$RemoteHost"
$tarPrefix = ""
if ($UseSudo) {
  $tarPrefix = "sudo -n "
}

$remoteCommand = "${tarPrefix}tar --warning=no-file-changed --ignore-failed-read -czf $RemoteArchive /var/log 2>/tmp/logpull-tar-errors-$Stamp.txt; test -f $RemoteArchive"

Write-Host "Creating remote log archive on $Target..."
& ssh @sshArgs $Target $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote archive creation failed. Check SSH auth and logpull permissions."
}

Write-Host "Downloading $RemoteArchive..."
& scp @scpArgs "${Target}:$RemoteArchive" $LocalArchive
if ($LASTEXITCODE -ne 0) {
  throw "Archive download failed."
}

Write-Host "Cleaning remote temporary archive..."
& ssh @sshArgs $Target "rm -f $RemoteArchive /tmp/logpull-tar-errors-$Stamp.txt" | Out-Null

if (Test-Path $LatestDir) {
  Remove-Item -LiteralPath $LatestDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $LatestDir | Out-Null

Write-Host "Extracting archive locally..."
tar -xzf $LocalArchive -C $LatestDir
if ($LASTEXITCODE -ne 0) {
  throw "Local archive extraction failed."
}

Write-Host "Parsing logs for dashboard..."
python (Join-Path $Root "scripts\parse-logs.py") --logs-root $LatestDir --output (Join-Path $DashboardData "logs.json") --host $RemoteHost --archive $LocalArchive
if ($LASTEXITCODE -ne 0) {
  throw "Parsing failed."
}

Write-Host "Done. Run .\scripts\serve.ps1 and open http://localhost:8080"
