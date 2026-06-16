#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-robowatch}"
INSTALL_DIR="${INSTALL_DIR:-/opt/robowatch}"
APP_PORT="${APP_PORT:-3000}"
API_PORT="${API_PORT:-8080}"
RUNTIME="${CONTAINER_RUNTIME:-}"
BACKEND_IMAGE="${BACKEND_IMAGE:-robowatch-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-robowatch-frontend:latest}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
DB_USER="${DB_USER:-amr}"
DB_NAME="${DB_NAME:-amrdashboard}"
DB_PASSWORD="${DB_PASSWORD:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
SCHEDULE_AM="${SCHEDULE_AM:-0 6 * * *}"
SCHEDULE_PM="${SCHEDULE_PM:-0 18 * * *}"
NETWORK_NAME="${NETWORK_NAME:-robowatch-net}"
DB_VOLUME="${DB_VOLUME:-robowatch-pgdata}"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_SCRIPT="${INSTALL_DIR}/robowatch-control.sh"
ENV_FILE="${INSTALL_DIR}/robowatch.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo:"
  echo "  sudo bash scripts/install-ubuntu-containers.sh"
  exit 1
fi

if [[ ! -f /etc/os-release ]] || ! grep -qi ubuntu /etc/os-release; then
  echo "This installer is intended for Ubuntu Linux."
  echo "For other Linux distributions, use docker-compose.yml or scripts/build-container-images.sh."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl openssl

if [[ -z "${RUNTIME}" ]]; then
  if command -v podman >/dev/null 2>&1; then
    RUNTIME="podman"
  elif command -v docker >/dev/null 2>&1; then
    RUNTIME="docker"
  else
    apt-get install -y podman
    RUNTIME="podman"
  fi
fi

if ! command -v "${RUNTIME}" >/dev/null 2>&1; then
  echo "Container runtime not found: ${RUNTIME}"
  exit 1
fi

if [[ -z "${DB_PASSWORD}" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
fi

if [[ -z "${ENCRYPTION_KEY}" ]]; then
  ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
fi

mkdir -p "${INSTALL_DIR}"
chmod 750 "${INSTALL_DIR}"

{
  printf 'SERVICE_NAME=%q\n' "${SERVICE_NAME}"
  printf 'APP_PORT=%q\n' "${APP_PORT}"
  printf 'API_PORT=%q\n' "${API_PORT}"
  printf 'RUNTIME=%q\n' "${RUNTIME}"
  printf 'BACKEND_IMAGE=%q\n' "${BACKEND_IMAGE}"
  printf 'FRONTEND_IMAGE=%q\n' "${FRONTEND_IMAGE}"
  printf 'POSTGRES_IMAGE=%q\n' "${POSTGRES_IMAGE}"
  printf 'DB_USER=%q\n' "${DB_USER}"
  printf 'DB_NAME=%q\n' "${DB_NAME}"
  printf 'DB_PASSWORD=%q\n' "${DB_PASSWORD}"
  printf 'ENCRYPTION_KEY=%q\n' "${ENCRYPTION_KEY}"
  printf 'SCHEDULE_AM=%q\n' "${SCHEDULE_AM}"
  printf 'SCHEDULE_PM=%q\n' "${SCHEDULE_PM}"
  printf 'NETWORK_NAME=%q\n' "${NETWORK_NAME}"
  printf 'DB_VOLUME=%q\n' "${DB_VOLUME}"
} >"${ENV_FILE}"
chmod 600 "${ENV_FILE}"

echo "Building RoboWatch images with ${RUNTIME}..."
"${RUNTIME}" build -t "${BACKEND_IMAGE}" -f "${SOURCE_DIR}/backend/Dockerfile" "${SOURCE_DIR}/backend"
"${RUNTIME}" build -t "${FRONTEND_IMAGE}" -f "${SOURCE_DIR}/frontend/Dockerfile" "${SOURCE_DIR}/frontend"

cat >"${CONTROL_SCRIPT}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(dirname "$0")/robowatch.env"
set -a
source "${ENV_FILE}"
set +a

DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=disable"

container_exists() {
  "${RUNTIME}" container exists "$1" >/dev/null 2>&1
}

remove_container() {
  if container_exists "$1"; then
    "${RUNTIME}" rm -f "$1" >/dev/null 2>&1 || true
  fi
}

ensure_network() {
  "${RUNTIME}" network inspect "${NETWORK_NAME}" >/dev/null 2>&1 || "${RUNTIME}" network create "${NETWORK_NAME}" >/dev/null
}

wait_for_postgres() {
  for _ in $(seq 1 60); do
    if "${RUNTIME}" exec robowatch-postgres pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Postgres did not become ready."
  return 1
}

start_stack() {
  ensure_network
  "${RUNTIME}" volume inspect "${DB_VOLUME}" >/dev/null 2>&1 || "${RUNTIME}" volume create "${DB_VOLUME}" >/dev/null

  remove_container robowatch-frontend
  remove_container robowatch-backend
  remove_container robowatch-postgres

  "${RUNTIME}" run -d --name robowatch-postgres \
    --network "${NETWORK_NAME}" --network-alias postgres \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -v "${DB_VOLUME}:/var/lib/postgresql/data" \
    "${POSTGRES_IMAGE}" >/dev/null

  wait_for_postgres

  "${RUNTIME}" run -d --name robowatch-backend \
    --network "${NETWORK_NAME}" --network-alias backend \
    -p "${API_PORT}:8080" \
    -e DATABASE_URL="${DATABASE_URL}" \
    -e SERVER_PORT=8080 \
    -e ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
    -e SCHEDULE_AM="${SCHEDULE_AM}" \
    -e SCHEDULE_PM="${SCHEDULE_PM}" \
    "${BACKEND_IMAGE}" >/dev/null

  "${RUNTIME}" run -d --name robowatch-frontend \
    --network "${NETWORK_NAME}" \
    -p "${APP_PORT}:80" \
    "${FRONTEND_IMAGE}" >/dev/null
}

stop_stack() {
  remove_container robowatch-frontend
  remove_container robowatch-backend
  remove_container robowatch-postgres
}

status_stack() {
  "${RUNTIME}" ps -a --filter "name=robowatch-"
}

case "${1:-start}" in
  start) start_stack ;;
  stop) stop_stack ;;
  restart) stop_stack; start_stack ;;
  status) status_stack ;;
  *) echo "Usage: $0 {start|stop|restart|status}"; exit 2 ;;
esac
EOF
chmod 750 "${CONTROL_SCRIPT}"

cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=RoboWatch AMR Dashboard container stack
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${CONTROL_SCRIPT} start
ExecStop=${CONTROL_SCRIPT} stop
TimeoutStartSec=300
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${APP_PORT}/tcp" || true
fi

HOST_IP="$(hostname -I | awk '{print $1}')"
echo
echo "RoboWatch installed."
echo "  Service: sudo systemctl status ${SERVICE_NAME}"
echo "  App:     http://${HOST_IP}:${APP_PORT}"
echo "  API:     http://${HOST_IP}:${API_PORT}/api"
echo "  Config:  ${ENV_FILE}"
echo
echo "Useful commands:"
echo "  sudo ${CONTROL_SCRIPT} status"
echo "  sudo systemctl restart ${SERVICE_NAME}"
