# RoboWatch Deployment

RoboWatch ships as three containers:

- `robowatch-postgres` - PostgreSQL 16 database
- `robowatch-backend` - Go API and SSH log collector
- `robowatch-frontend` - React UI served by Nginx

## Build Images

From the repository root:

```bash
bash scripts/build-container-images.sh
```

Optional image names:

```bash
BACKEND_IMAGE=ghcr.io/example/robowatch-backend:1.0 \
FRONTEND_IMAGE=ghcr.io/example/robowatch-frontend:1.0 \
bash scripts/build-container-images.sh
```

Push those tags with your container runtime if you want to publish them.

## Run With Docker Compose

```bash
cp .env.example .env
printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" > .env
docker compose up -d --build
```

Open:

- App: http://localhost:3000
- API: http://localhost:8080/api

## Linux Docker Installer

The Linux Docker installer supports Ubuntu/Debian and AlmaLinux/RHEL-family systems. It installs Docker when needed, builds the images locally, creates a Postgres volume, starts all containers, opens the app firewall port when possible, and installs a systemd service.

```bash
sudo bash scripts/install-linux-docker.sh
```

Defaults:

- App port: `3000`
- API port: `8080`
- Install directory: `/opt/robowatch`
- Service name: `robowatch`
- Runtime: Docker

Common options:

```bash
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-linux-docker.sh
```

```bash
sudo BACKEND_IMAGE=robowatch-backend:prod \
  FRONTEND_IMAGE=robowatch-frontend:prod \
  SERVICE_NAME=robowatch \
  bash scripts/install-linux-docker.sh
```

Manage the installed service:

```bash
sudo systemctl status robowatch
sudo systemctl restart robowatch
sudo /opt/robowatch/robowatch-control.sh status
```

The installer writes secrets and runtime settings to:

```text
/opt/robowatch/robowatch.env
```

Keep that file private because it contains the database password, SSH credential encryption key, and web login password.

## Updating A Linux Docker Install

Pull the new code, then rerun:

```bash
sudo bash scripts/install-linux-docker.sh
```

The Postgres data stays in the `robowatch-pgdata` container volume.
