# Project Memory

- GitHub repository: `yashwanta/AMRDashboard`
- Local workspace: `C:\AMRDasboardCodex`
- Active branch: `codex/log-dashboard-work`
- Do not commit or push to `main`.
- User preference: commit and push completed app changes to `codex/log-dashboard-work` unless they explicitly say not to.

## Current Local App

- Web app URL: `http://127.0.0.1:3000/`
- Backend API URL: `http://127.0.0.1:8080/`
- Stats endpoint through frontend proxy: `http://127.0.0.1:3000/api/stats`
- Local development login: `admin` / `admin`
- Login is controlled by `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET`.

## Running Containers

- `amrdashboard_frontend_1` serves the React build on port `3000`.
- `amrdashboard_backend_1` serves the Go API on port `8080`.
- `amrdashboard_postgres_1` uses volume `amrdashboard_pgdata` and should stay on the internal `amrdashboard_default` network.
- If the backend is recreated, restart `amrdashboard_frontend_1` because Nginx can cache the old backend container IP.
- There may also be an unrelated `postgres-db` container on host port `5432`; do not use it for RoboWatch data.

## Recent Features

- RoboWatch log review for Robot/FleetManager, Ubuntu, and Proxmox/PVE logs.
- Logs page with filters, search, detail view, raw log retention, and plain-English raw log explanation.
- Incident Summary with root cause, evidence, and recommended fix.
- Row-level OOM/VM killed analysis with killed VM, PID/process, highest-memory VM, Proxmox host, confidence, explanation, and recommendation.
- Global/multi-VMID config; do not hardcode VMID `113`.
- Login page and protected API routes.
- Automation page for approved SSH actions:
  - service status/start/stop/restart/enable/disable
  - approved package/kernel remediation actions
  - unrestricted custom command only when `ALLOW_CUSTOM_COMMANDS=true`
- OpsForge does not collect or pipe sudo passwords. Privileged actions require root or passwordless sudo on the target server.
- Automation runs are audited in `action_runs`.
- Linux Docker installer supports Ubuntu/Debian and AlmaLinux/RHEL-family systems.

## Known Verified OOM Case

- Timestamp: `2026-06-09T03:08:19Z`
- Local display: Jun 8, 2026 11:08 PM
- Proxmox host: `10.222.10.50`
- Killed VM: VM `113` (`USSPRAMRFLMGR260003`)
- Killed PID/process: `227114` (`kvm`)
- Highest-memory VM: VM `113` (`USSPRAMRFLMGR260003`)
- Top RSS: `13.73 GB`
- Killed anon RSS: `14.32 GB`
- Config RAM: `16384 MB`
- API verified for server IDs `1` and `4`.

## Local Files To Avoid Committing

- `frontend/vite-dev.err.log`
- `frontend/vite-dev.out.log`

## Useful Verification

- Frontend build: `npm run build` in `frontend`
- Backend tests: set `GOCACHE=C:\AMRDasboardCodex\.gocache`, then run `go test ./...` in `backend`
- Remove `.gocache` after tests.
