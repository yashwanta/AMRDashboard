# AMRDashboard

Pulling logs and creating dashboard for visibility.

Self-contained dashboard for logs pulled from `logpull@10.216.4.59`.

## Pull Logs

Run this from PowerShell after SSH auth is configured for `logpull`:

```powershell
.\scripts\pull-logs.ps1 -RemoteHost 10.216.4.59 -User logpull
```

If the account needs a key:

```powershell
.\scripts\pull-logs.ps1 -RemoteHost 10.216.4.59 -User logpull -IdentityFile C:\path\to\key
```

If `logpull` has passwordless sudo for `tar`, add `-UseSudo` to capture privileged logs:

```powershell
.\scripts\pull-logs.ps1 -RemoteHost 10.216.4.59 -User logpull -UseSudo
```

The script downloads a compressed archive into `data\archives`, extracts it into
`data\logs\latest`, and writes dashboard data to `dashboard\data\logs.json`.

## View Dashboard

```powershell
.\scripts\serve.ps1
```

Then open <http://localhost:8080>.

## View Dashboard With Login On Port 8885

For local testing on this Windows machine:

```powershell
.\scripts\serve-login.ps1 -Port 8885 -User admin -Password "ChangeMe123!"
```

Then open <http://localhost:8885>.

To make it available from the Ubuntu server as `http://10.216.4.59:8885`,
copy this project to that server and run:

```bash
export AMR_DASH_USER=admin
export AMR_DASH_PASSWORD='ChangeMe123!'
python3 scripts/serve-login.py --host 0.0.0.0 --port 8885
```

For a persistent Ubuntu service:

```bash
cd /path/to/AMRDashboard
sudo AMR_DASH_USER=admin AMR_DASH_PASSWORD='ChangeMe123!' bash scripts/install-ubuntu-service.sh
```

Then check from another machine:

```powershell
Test-NetConnection 10.216.4.59 -Port 8885
```

If the browser says the connection was refused, check on Ubuntu:

```bash
sudo systemctl status amr-log-dashboard
sudo ss -ltnp | grep ':8885'
sudo ufw status
```

Open <http://10.216.4.59:8885> and sign in with the configured username and password.

## Pull RDS Web Data

The dashboard can also pull live AMR data from the RDS web UI at
`http://10.216.4.59:8080/#/view`.

```powershell
.\scripts\pull-rds-data.ps1 -BaseUrl http://10.216.4.59:8080 -Username amrdashboard -Password "<password>"
```

On Ubuntu:

```bash
python3 scripts/pull-rds-data.py --base-url http://10.216.4.59:8080 --username amrdashboard --password "<password>" --output dashboard/data/rds.json
```

To refresh logs, RDS web data, and restart the web dashboard on Ubuntu:

```bash
RDS_PASSWORD='<password>' bash scripts/update-dashboard.sh
```
