# RoboWatch Installation

This guide installs RoboWatch as a containerized app with:

- React/Nginx frontend
- Go backend API
- PostgreSQL database

The easiest production install is the Linux Docker installer. It supports Ubuntu/Debian and AlmaLinux/RHEL-family servers.

## Linux Quick Install

On the Ubuntu or AlmaLinux server:

```bash
# Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y git

# AlmaLinux/RHEL-family:
sudo dnf install -y git
```

Then:

```bash
git clone https://github.com/yashwanta/AMRDashboard.git
cd AMRDashboard
sudo bash scripts/install-linux-docker.sh
```

Open the app:

```text
http://SERVER_IP:3000
```

Check service status:

```bash
sudo systemctl status robowatch
sudo /opt/robowatch/robowatch-control.sh status
```

## Custom Ports

Use this if port `3000` or `8080` is already used:

```bash
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-linux-docker.sh
```

Then open:

```text
http://SERVER_IP:8088
```

## What The Installer Does

The installer:

- Detects Ubuntu/Debian or AlmaLinux/RHEL-family Linux.
- Installs Docker Engine and required packages.
- Builds the RoboWatch backend and frontend images locally.
- Starts PostgreSQL, backend, and frontend containers.
- Creates a `robowatch` systemd service.
- Opens the web UI port in `ufw` or `firewalld` when available.

## Build Images Only

Use this when you want to build/push container images manually:

```bash
bash scripts/build-container-images.sh
```

Custom image tags:

```bash
BACKEND_IMAGE=robowatch-backend:1.0 \
FRONTEND_IMAGE=robowatch-frontend:1.0 \
bash scripts/build-container-images.sh
```

## Docker Compose Install

For a simple local install:

```bash
cp .env.example .env
printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" > .env
docker compose up -d --build
```

Open:

```text
http://localhost:3000
```

## Update RoboWatch

From the repo directory:

```bash
git pull
sudo bash scripts/install-linux-docker.sh
```

The PostgreSQL data remains in the `robowatch-pgdata` container volume.

## Stop Or Restart

```bash
sudo systemctl restart robowatch
sudo systemctl stop robowatch
sudo systemctl start robowatch
```

## Logs

```bash
sudo docker logs robowatch-backend
sudo docker logs robowatch-frontend
sudo docker logs robowatch-postgres
```

## Configuration

The installer writes configuration here:

```text
/opt/robowatch/robowatch.env
```

This file contains the database password, `ENCRYPTION_KEY`, and web login password, so keep it private.

Important settings:

| Variable | Default | Description |
| --- | --- | --- |
| `APP_PORT` | `3000` | Web UI port |
| `API_PORT` | `8080` | Backend API port |
| `SERVICE_NAME` | `robowatch` | systemd service name |
| `ENCRYPTION_KEY` | generated | Key used to encrypt saved SSH credentials |
| `SESSION_SECRET` | generated | Key used to sign web login tokens |
| `ADMIN_USERNAME` | `admin` | Web login username |
| `ADMIN_PASSWORD` | generated | Web login password |
| `ALLOW_CUSTOM_COMMANDS` | `false` | Enables custom Automation commands |
| `SCHEDULE_AM` | `0 6 * * *` | Morning sync cron |
| `SCHEDULE_PM` | `0 18 * * *` | Evening sync cron |

## Troubleshooting

If the site does not load:

```bash
sudo systemctl status robowatch
sudo /opt/robowatch/robowatch-control.sh status
```

If the port is already in use, reinstall with different ports:

```bash
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-ubuntu-containers.sh
```

If SSH tests fail in the app, verify the target server allows SSH from the RoboWatch server and that the username/password or SSH key is correct.

More deployment details are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
