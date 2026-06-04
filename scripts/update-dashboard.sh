#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RDS_BASE_URL="${RDS_BASE_URL:-http://10.216.4.59:8080}"
RDS_USERNAME="${RDS_USERNAME:-amrdashboard}"
RDS_PASSWORD="${RDS_PASSWORD:-}"

if [[ -z "${RDS_PASSWORD}" ]]; then
  echo "RDS_PASSWORD is required."
  exit 1
fi

cd "${ROOT}"
sudo python3 scripts/parse-logs.py --logs-root /var/log --output dashboard/data/logs.json --host 10.216.4.59 --archive local-var-log
python3 scripts/pull-rds-data.py --base-url "${RDS_BASE_URL}" --username "${RDS_USERNAME}" --password "${RDS_PASSWORD}" --output dashboard/data/rds.json
sudo systemctl restart amr-log-dashboard
