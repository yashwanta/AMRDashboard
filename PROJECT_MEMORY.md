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
- Keep local access simple unless the user explicitly asks again: use `localhost` / `127.0.0.1`, not a LAN forwarding IP.
- After the last reboot recovery, the app was restored by starting containers in order: Postgres, backend, then frontend.

## Running Containers

- `amrdashboard_frontend_1` serves the React build on port `3000`.
- `amrdashboard_backend_1` serves the Go API on port `8080`.
- `amrdashboard_postgres_1` uses volume `amrdashboard_pgdata` and should stay on the internal `amrdashboard_default` network.
- If the backend is recreated, restart `amrdashboard_frontend_1` because Nginx can cache the old backend container IP.
- There may also be an unrelated `postgres-db` container on host port `5432`; do not use it for RoboWatch data.
- On reboot, if `127.0.0.1:3000` is down, check `podman ps -a`. Start `amrdashboard_postgres_1` first, wait for it, then start `amrdashboard_backend_1`, then `amrdashboard_frontend_1`.

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
- Latest OpsForge privilege fix: backend now checks passwordless sudo using `sudo -n /bin/sh -c ...`, matching the generated sudoers rule for `/bin/sh` and `/usr/bin/sh`.
- Latest pushed commit for that fix: `66a7ac1 Fix OpsForge privilege check sudo command`.

## Current Server State

- API verified 8 saved servers after reboot recovery.
- `USSHBUBUSTR250001` (`10.205.22.17`) uses username `robowatch`, private-key auth, and is tagged as `server`.
- `USSHBUBUSTR250001` privilege check passed after the `/bin/sh` sudo fix:
  `Privilege check: PASS. Passwordless sudo is available for approved RoboWatch shell actions; patch and reboot actions can run.`
- Important SSH key rule for OpsForge:
  - Private key from Windows app host goes in RoboWatch server record: `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key`.
  - Public key goes on the Linux target in `authorized_keys`: `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key.pub`.
  - If the key is regenerated or overwritten, rerun the target bootstrap with the new `.pub` key.
- Generated sudoers model for target bootstrap:
  `robowatch ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh`

## OpsForge SSH Key Setup

Goal: RoboWatch/OpsForge runs from the Windows laptop and connects to a Linux target such as `USSHBUBUSTR250001` (`10.205.22.17`).

Key rule:

- Private key stays on Windows/RoboWatch.
- Public key goes on the Linux server.

Windows key files:

- Private key: `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key`
- Public key: `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key.pub`

The private key starts with:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
```

The public key starts with:

```text
ssh-ed25519
```

Target-side setup:

1. Open `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key.pub` on Windows and copy the full one-line public key.
2. Log in to the Linux target as a sudo/root user.
3. Run the following on the Linux target, replacing `PASTE_PUBLIC_KEY_HERE` with the full public key:

```bash
sudo useradd -m -s /bin/bash robowatch 2>/dev/null || true
sudo install -d -m 700 -o robowatch -g robowatch /home/robowatch/.ssh
echo 'PASTE_PUBLIC_KEY_HERE' | sudo tee /home/robowatch/.ssh/authorized_keys >/dev/null
sudo chown robowatch:robowatch /home/robowatch/.ssh/authorized_keys
sudo chmod 600 /home/robowatch/.ssh/authorized_keys
```

4. Allow only the approved RoboWatch shell actions:

```bash
echo 'robowatch ALL=(root) NOPASSWD: /bin/sh, /usr/bin/sh' | sudo tee /etc/sudoers.d/robowatch-robowatch >/dev/null
sudo chmod 440 /etc/sudoers.d/robowatch-robowatch
sudo visudo -cf /etc/sudoers.d/robowatch-robowatch
```

RoboWatch server record setup:

1. Open `C:\Users\Yashwanta.Thakur\.ssh\ansible_patch_key` on Windows.
2. Copy the full private key, including the `BEGIN OPENSSH PRIVATE KEY` and `END OPENSSH PRIVATE KEY` lines.
3. In RoboWatch, go to `Servers`, edit the target server, and set:
   - Username: `robowatch`
   - Auth type: `Private Key`
   - Private key: paste the full private key from Windows.
4. Save, then go to `OpsForge Automation` and run `Check privilege access`.

Expected success:

```text
Privilege check: PASS. Passwordless sudo is available for approved RoboWatch shell actions; patch and reboot actions can run.
```

If the Windows key is regenerated or overwritten, rerun the target-side public key setup with the new `.pub` key.

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
