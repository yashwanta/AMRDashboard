# Project Memory

- GitHub repository: `yashwanta/AMRDashboard`
- Local workspace: `C:\AMRDashboard`
- Target Ubuntu server: `10.216.4.59`
- Web dashboard port: `8885`
- Dashboard service name: `amr-log-dashboard`
- Login server entrypoint: `scripts/serve-login.py`
- Ubuntu service installer: `scripts/install-ubuntu-service.sh`

## Current Notes

- The dashboard is a static HTML/CSS/JavaScript frontend served behind a small Python login wrapper.
- Server log collection is handled by `scripts/pull-logs.ps1`, which pulls `/var/log` over SSH and refreshes `dashboard/data/logs.json`.
- SSH to `logpull@10.216.4.59` previously failed with `Permission denied (publickey,password)`.
- Browser access to `http://10.216.4.59:8885` returned `ERR_CONNECTION_REFUSED`, which means the service was not listening on the Ubuntu server yet.

