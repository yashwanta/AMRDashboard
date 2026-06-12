# RoboWatch Install Package

Use this when you want to copy the web app to another server and install it there.

## Create The Package

From the project folder on your build machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-install-package.ps1
```

This creates:

```text
packages\robowatch-install-YYYYMMDD-HHMMSS.zip
packages\robowatch-install-YYYYMMDD-HHMMSS.tar.gz
```

Optional image bundle:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-install-package.ps1 -IncludeImages
```

`-IncludeImages` builds and stores Docker images inside `images\robowatch-images.tar`. The target server still needs Docker installed, but it will not need to rebuild the app images.

## Ubuntu Install

Copy the `.tar.gz` or `.zip` to the Ubuntu server, extract it, then run:

```bash
cd robowatch-install-*
sudo bash scripts/install-linux-docker.sh
```

Open:

```text
http://SERVER_IP:3000
```

## AlmaLinux Install

Copy the `.tar.gz` or `.zip` to the AlmaLinux server, extract it, then run:

```bash
cd robowatch-install-*
sudo bash scripts/install-linux-docker.sh
```

The installer uses `dnf`/`yum`, installs Docker Engine when needed, opens the web port with `firewalld` when possible, and creates a `robowatch` systemd service.

Open:

```text
http://SERVER_IP:3000
```

## Windows Install

Extract the `.zip`, open PowerShell as Administrator, then run:

```powershell
cd C:\Path\To\robowatch-install
powershell -ExecutionPolicy Bypass -File scripts\install-windows-docker.ps1
```

If Docker is not installed:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows-docker.ps1 -InstallDockerIfMissing
```

After Docker Desktop is installed, reboot or start Docker Desktop, then rerun the installer.

Open:

```text
http://localhost:3000
```

## Custom Ports

Linux:

```bash
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-linux-docker.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows-docker.ps1 -AppPort 8088 -ApiPort 18080
```

## Default Login

The installer prints the generated login at the end.

Linux stores it here:

```text
/opt/robowatch/robowatch.env
```

Windows stores it here:

```text
.env
```

## Manage The App

Linux:

```bash
sudo systemctl status robowatch
sudo systemctl restart robowatch
sudo /opt/robowatch/robowatch-control.sh status
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\robowatch-windows-control.ps1 status
powershell -ExecutionPolicy Bypass -File .\robowatch-windows-control.ps1 restart
```

## Notes

- The database is stored in a Docker volume, so app restarts do not delete data.
- Keep `.env` and `/opt/robowatch/robowatch.env` private because they contain secrets.
- Custom OpsForge commands remain disabled unless explicitly enabled.
