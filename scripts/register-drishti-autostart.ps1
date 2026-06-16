$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$startScript = Join-Path $repoRoot "scripts\start-drishti-opsforge.ps1"
$taskName = "Drishti OpsForge Autostart"

if (-not (Test-Path -LiteralPath $startScript)) {
  throw "Start script not found: $startScript"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Starts Drishti OpsForge local Podman containers after Windows login." `
    -Force | Out-Null
} catch {
  Write-Host "Register-ScheduledTask failed; trying schtasks.exe fallback."
  $taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
  schtasks.exe /Create /TN $taskName /TR $taskCommand /SC ONLOGON /F | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not register scheduled task with Register-ScheduledTask or schtasks.exe."
  }
}

Write-Host "Registered Windows scheduled task: $taskName"
Write-Host "It will run after this Windows user logs in."
Write-Host "Manual start command:"
Write-Host "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
