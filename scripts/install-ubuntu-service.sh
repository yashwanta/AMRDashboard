#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="amr-log-dashboard"
PORT="${PORT:-8885}"
HOST="${HOST:-0.0.0.0}"
USER_NAME="${AMR_DASH_USER:-admin}"
PASSWORD="${AMR_DASH_PASSWORD:-admin123}"
SECRET="${AMR_DASH_SECRET:-$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo AMR_DASH_PASSWORD='ChangeMe123!' bash scripts/install-ubuntu-service.sh"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=AMR Log Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=AMR_DASH_USER=${USER_NAME}
Environment=AMR_DASH_PASSWORD=${PASSWORD}
Environment=AMR_DASH_SECRET=${SECRET}
ExecStart=/usr/bin/python3 ${APP_DIR}/scripts/serve-login.py --host ${HOST} --port ${PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PORT}/tcp" || true
fi

echo "Service installed: ${SERVICE_NAME}"
echo "Check status: sudo systemctl status ${SERVICE_NAME}"
echo "Open: http://$(hostname -I | awk '{print $1}'):${PORT}"

