# RoboWatch Installation

This guide installs RoboWatch as a containerized app with:

- React/Nginx frontend
- Go backend API
- PostgreSQL database

The easiest production install is the Ubuntu installer.

## Ubuntu Quick Install

On the Ubuntu server:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/yashwanta/AMRDashboard.git
cd AMRDashboard
sudo bash scripts/install-ubuntu-containers.sh
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
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-ubuntu-containers.sh
```

Then open:

```text
http://SERVER_IP:8088
```

## Use Docker Instead Of Podman

The installer uses Podman if installed, Docker if installed, and installs Podman if neither exists.

To force Docker:

```bash
sudo CONTAINER_RUNTIME=docker bash scripts/install-ubuntu-containers.sh
```

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
sudo bash scripts/install-ubuntu-containers.sh
```

The PostgreSQL data remains in the `robowatch-pgdata` container volume.

## Stop Or Restart

```bash
sudo systemctl restart robowatch
sudo systemctl stop robowatch
sudo systemctl start robowatch
```

## Logs

For Podman:

```bash
sudo podman logs robowatch-backend
sudo podman logs robowatch-frontend
sudo podman logs robowatch-postgres
```

For Docker:

```bash
sudo docker logs robowatch-backend
sudo docker logs robowatch-frontend
sudo docker logs robowatch-postgres
```

## Configuration

The Ubuntu installer writes configuration here:

```text
/opt/robowatch/robowatch.env
```

This file contains the database password and `ENCRYPTION_KEY`, so keep it private.

Important settings:

| Variable | Default | Description |
| --- | --- | --- |
| `APP_PORT` | `3000` | Web UI port |
| `API_PORT` | `8080` | Backend API port |
| `SERVICE_NAME` | `robowatch` | systemd service name |
| `CONTAINER_RUNTIME` | auto | `podman` or `docker` |
| `ENCRYPTION_KEY` | generated | Key used to encrypt saved SSH credentials |
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
