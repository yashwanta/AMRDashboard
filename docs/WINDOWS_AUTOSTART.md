# Windows Autostart For Drishti OpsForge

This page explains how to start Drishti OpsForge after a Windows reboot and which local Podman containers belong to the app.

## Drishti Containers

These three containers are required for Drishti OpsForge:

| Friendly name | Podman container name | Purpose | Required |
| --- | --- | --- | --- |
| Drishti Database | `amrdashboard_postgres_1` | PostgreSQL app database | Yes |
| Drishti Backend API | `amrdashboard_backend_1` | Go API, SSH log sync, OpsForge automation | Yes |
| Drishti Web UI | `amrdashboard_frontend_1` | Browser app on port `3000` | Yes |

Open the app here:

```text
http://127.0.0.1:3000/login
```

## Containers That Are Not Part Of Drishti

The following containers are not required for the Drishti app unless they are being used for a separate test:

| Container | Notes |
| --- | --- |
| `charming_euclid` | Podman hello-world test container. Safe to remove if not needed. |
| `postgres-db` | Separate PostgreSQL container on host port `5432`. Do not use for Drishti data. Remove only if no other project needs it. |
| `ubuntu-dev` | Ubuntu SSH test container on host port `2222`. Remove only if no longer used for testing. |
| `ubuntu-rds` | Ubuntu SSH test container on host port `2223`. Remove only if no longer used for testing. |

Do not remove `amrdashboard_postgres_1` unless you intentionally want to remove the Drishti database container. The database volume is separate, but deleting containers casually can still create confusion.

## Manual Start

From PowerShell:

```powershell
cd C:\DRISHTI-SiteOps
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-drishti-opsforge.ps1
```

The script starts the stack in the correct order:

1. Drishti Database
2. Drishti Backend API
3. Drishti Web UI

## Register Autostart

Run this once from PowerShell:

```powershell
cd C:\DRISHTI-SiteOps
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-drishti-startup-shortcut.ps1
```

This creates this Windows Startup launcher:

```text
C:\Users\Yashwanta.Thakur\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Start Drishti OpsForge.cmd
```

The launcher runs after the Windows user logs in. This is the best fit for Podman Desktop on Windows because the Podman machine runs in the user session.

There is also a scheduled-task registration helper:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-drishti-autostart.ps1
```

If Windows denies Scheduled Task creation, use the Startup launcher method above.

## Check Status

```powershell
podman ps -a
```

Expected Drishti containers:

```text
amrdashboard_postgres_1   Up
amrdashboard_backend_1    Up
amrdashboard_frontend_1   Up
```

## Troubleshooting

If the site does not load:

```powershell
podman ps -a
podman logs --tail 50 amrdashboard_backend_1
podman logs --tail 50 amrdashboard_frontend_1
```

If only the database is running, start Drishti again:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\DRISHTI-SiteOps\scripts\start-drishti-opsforge.ps1
```
