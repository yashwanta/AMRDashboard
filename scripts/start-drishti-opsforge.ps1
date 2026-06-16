param(
  [int]$BackendTimeoutSeconds = 90,
  [int]$FrontendTimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

$containers = [ordered]@{
  Database = "amrdashboard_postgres_1"
  Backend  = "amrdashboard_backend_1"
  Web      = "amrdashboard_frontend_1"
}

function Write-Step {
  param([string]$Message)
  Write-Host "[Drishti OpsForge] $Message"
}

function Start-ContainerIfNeeded {
  param(
    [string]$FriendlyName,
    [string]$ContainerName
  )

  $state = podman inspect $ContainerName --format "{{.State.Status}}" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $state) {
    throw "Container not found: $ContainerName ($FriendlyName)"
  }

  if ($state.Trim() -eq "running") {
    Write-Step "$FriendlyName is already running ($ContainerName)."
    return
  }

  Write-Step "Starting $FriendlyName ($ContainerName)..."
  podman start $ContainerName | Out-Null
}

function Wait-HttpOk {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Step "$Name is responding at $Url."
        return
      }
    } catch {
      Start-Sleep -Seconds 3
    }
  } while ((Get-Date) -lt $deadline)

  throw "$Name did not respond at $Url within $TimeoutSeconds seconds."
}

Write-Step "Starting local Drishti OpsForge stack..."

try {
  podman machine start 2>$null | Out-Null
} catch {
  Write-Step "Podman machine start returned a warning; continuing."
}

Start-ContainerIfNeeded -FriendlyName "Database" -ContainerName $containers.Database
Start-Sleep -Seconds 5

Start-ContainerIfNeeded -FriendlyName "Backend API" -ContainerName $containers.Backend
Wait-HttpOk -Name "Backend API" -Url "http://127.0.0.1:8080/api/stats" -TimeoutSeconds $BackendTimeoutSeconds

Start-ContainerIfNeeded -FriendlyName "Web UI" -ContainerName $containers.Web
Wait-HttpOk -Name "Web UI" -Url "http://127.0.0.1:3000/login" -TimeoutSeconds $FrontendTimeoutSeconds

Write-Step "Ready: http://127.0.0.1:3000/login"
