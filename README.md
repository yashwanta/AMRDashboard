# AMR Dashboard

Self-hosted Linux server log monitoring dashboard — new Go + React stack.  
Pulls logs over SSH on demand or automatically at **6 AM and 6 PM**, then visualises crashes, power-offs, and errors.

> The original scripts (`scripts/`, `dashboard/`) are preserved for reference.

## Stack

| Layer      | Technology                     |
|------------|-------------------------------|
| Backend    | Go 1.22                        |
| HTTP       | chi v5                         |
| Database   | PostgreSQL 16 + pgx v5         |
| Scheduler  | robfig/cron                    |
| Frontend   | React 18 + TypeScript + Vite   |
| Styling    | Tailwind CSS                   |
| Charts     | Recharts                       |

---

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env — set a real ENCRYPTION_KEY (32+ chars)

docker compose up -d
```

- Frontend → http://localhost:3000  
- Backend API → http://localhost:8080/api

---

## Build Container Images

```bash
bash scripts/build-container-images.sh
```

Optional custom tags:

```bash
BACKEND_IMAGE=robowatch-backend:1.0 FRONTEND_IMAGE=robowatch-frontend:1.0 bash scripts/build-container-images.sh
```

## Linux Docker Installer

For a full Ubuntu, Debian, AlmaLinux, or RHEL-family install with Docker and systemd restart support:

```bash
sudo bash scripts/install-linux-docker.sh
```

The installer installs Docker Engine when needed, builds the app images, starts PostgreSQL/backend/frontend containers, and creates a `robowatch` systemd service.

Useful options:

```bash
sudo APP_PORT=8088 API_PORT=18080 bash scripts/install-linux-docker.sh
sudo systemctl status robowatch
```

Step-by-step install guide: [INSTALL.md](INSTALL.md)  
Copyable Ubuntu/AlmaLinux/Windows install package: [docs/INSTALL_PACKAGE.md](docs/INSTALL_PACKAGE.md)  
More deployment details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Development Setup

### Prerequisites
- Go 1.22+
- Node 20+
- PostgreSQL 16 running locally (or `docker compose up postgres -d`)

### Backend

```bash
cp backend/.env.example backend/.env
# Edit DATABASE_URL and ENCRYPTION_KEY

cd backend
go mod download
go run ./cmd/server
# → listening on :8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173  (proxies /api/* → :8080)
```

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://amr:amr@localhost:5432/amrdashboard` | PostgreSQL connection string |
| `SERVER_PORT` | `8080` | Backend HTTP port |
| `ENCRYPTION_KEY` | *(required)* | 32-byte AES key for SSH credential store |
| `SESSION_SECRET` | `ENCRYPTION_KEY` | Secret used to sign web login tokens |
| `ADMIN_USERNAME` | `admin` | Web login username |
| `ADMIN_PASSWORD` | `admin` | Web login password; change this before sharing the app |
| `ALLOW_CUSTOM_COMMANDS` | `false` | Enables unrestricted Automation commands; approved actions do not need this |
| `SCHEDULE_AM` | `0 6 * * *` | Morning auto-sync (6 AM) |
| `SCHEDULE_PM` | `0 18 * * *` | Evening auto-sync (6 PM) |

OpsForge security note: the app does not collect, store, echo, or pipe sudo passwords. Privileged remediation actions require the target SSH account to be `root` or to have passwordless sudo configured outside RoboWatch. Remediation scripts check for root privileges before running package-manager commands.

---

## Features

- **Server management** — add/edit/delete servers with password or SSH key auth
- **Test connection** — verify SSH credentials before saving
- **On-demand sync** — trigger a log pull for any server from the UI
- **Auto sync** — scheduled pulls at 6 AM and 6 PM (cron-configurable)
- **Log parsing** — detects:
  - 💥 **Crashes** (kernel panic, OOM killer, segfault, BUG, OOPS)
  - ⚡ **Power-offs / reboots**
  - ❌ **Service failures**, I/O errors, hardware (MCE/EDAC) errors
  - ⚠️ **Warnings**
- **Log sources** — journald, syslog, /var/log/messages, kern.log, auth.log
- **Dashboard** — stats cards + 7-day area chart + recent events feed
- **Logs page** — filterable table by server, type, severity, and date range
- **Sync history** — every sync job with duration, event count, and error details

---

## API Reference

| Method | Path                       | Description                    |
|--------|----------------------------|--------------------------------|
| GET    | `/api/servers`             | List all servers               |
| POST   | `/api/servers`             | Add server                     |
| PUT    | `/api/servers/:id`         | Update server                  |
| DELETE | `/api/servers/:id`         | Delete server                  |
| POST   | `/api/servers/:id/sync`    | Trigger sync for one server    |
| POST   | `/api/sync/all`            | Sync all servers               |
| POST   | `/api/sync/test`           | Test SSH connection            |
| GET    | `/api/logs`                | Query log events (filterable)  |
| GET    | `/api/stats`               | Dashboard stats                |
| GET    | `/api/timeline`            | 7-day hourly event breakdown   |
| GET    | `/api/sync-history`        | Last 50 sync jobs              |
