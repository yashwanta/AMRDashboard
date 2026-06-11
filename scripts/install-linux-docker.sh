#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-robowatch}"
INSTALL_DIR="${INSTALL_DIR:-/opt/robowatch}"
APP_PORT="${APP_PORT:-3000}"
API_PORT="${API_PORT:-8080}"
BACKEND_IMAGE="${BACKEND_IMAGE:-robowatch-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-robowatch-frontend:latest}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
DB_USER="${DB_USER:-amr}"
DB_NAME="${DB_NAME:-amrdashboard}"
DB_PASSWORD="${DB_PASSWORD:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
SESSION_SECRET="${SESSION_SECRET:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ALLOW_CUSTOM_COMMANDS="${ALLOW_CUSTOM_COMMANDS:-false}"
SCHEDULE_AM="${SCHEDULE_AM:-0 6 * * *}"
SCHEDULE_PM="${SCHEDULE_PM:-0 18 * * *}"
NETWORK_NAME="${NETWORK_NAME:-robowatch-net}"
DB_VOLUME="${DB_VOLUME:-robowatch-pgdata}"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_SCRIPT="${INSTALL_DIR}/robowatch-control.sh"
ENV_FILE="${INSTALL_DIR}/robowatch.env"
RUNTIME="docker"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo:"
  echo "  sudo bash scripts/install-linux-docker.sh"
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "Cannot detect Linux distribution: /etc/os-release not found."
  exit 1
fi

. /etc/os-release
OS_ID="${ID:-}"
OS_LIKE="${ID_LIKE:-}"

has_like() {
  case " ${OS_ID} ${OS_LIKE} " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

install_common_packages_apt() {
  apt-get update
  apt-get install -y ca-certificates curl gnupg openssl git
}

install_docker_ubuntu() {
  install_common_packages_apt
  if command -v docker >/dev/null 2>&1; then
    systemctl enable --now docker
    return
  fi

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  arch="$(dpkg --print-architecture)"
  codename="${VERSION_CODENAME:-}"
  if [[ -z "${codename}" ]]; then
    codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-}")"
  fi
  if [[ -z "${codename}" ]]; then
    echo "Could not determine apt codename for Docker repository."
    exit 1
  fi

  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${OS_ID} ${codename} stable" \
    >/etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_common_packages_dnf() {
  local pkg_manager="dnf"
  if ! command -v dnf >/dev/null 2>&1; then
    pkg_manager="yum"
  fi
  if [[ "${pkg_manager}" == "dnf" ]]; then
    dnf install -y ca-certificates curl openssl git dnf-plugins-core
  else
    yum install -y ca-certificates curl openssl git yum-utils
  fi
}

install_docker_rhel() {
  install_common_packages_dnf
  if command -v docker >/dev/null 2>&1; then
    systemctl enable --now docker
    return
  fi

  local pkg_manager="dnf"
  if ! command -v dnf >/dev/null 2>&1; then
    pkg_manager="yum"
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  else
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  fi

  "${pkg_manager}" install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}

install_docker() {
  case "${OS_ID}" in
    ubuntu|debian)
      install_docker_ubuntu
      ;;
    almalinux|rocky|rhel|centos|ol|fedora)
      install_docker_rhel
      ;;
    *)
      if has_like debian; then
        install_docker_ubuntu
      elif has_like rhel || has_like fedora; then
        install_docker_rhel
      else
        echo "Unsupported Linux distribution: ${PRETTY_NAME:-${OS_ID}}"
        echo "Supported: Ubuntu/Debian and AlmaLinux/RHEL-family distributions."
        exit 1
      fi
      ;;
  esac
}

open_firewall_port() {
  local port="$1"
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "${port}/tcp" || true
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="${port}/tcp" || true
    firewall-cmd --reload || true
  fi
}

install_docker

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker was not installed successfully."
  exit 1
fi

if [[ -z "${DB_PASSWORD}" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
fi

if [[ -z "${ENCRYPTION_KEY}" ]]; then
  ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
fi

if [[ -z "${SESSION_SECRET}" ]]; then
  SESSION_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '\n')"
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
  printf 'SESSION_SECRET=%q\n' "${SESSION_SECRET}"
  printf 'ADMIN_USERNAME=%q\n' "${ADMIN_USERNAME}"
  printf 'ADMIN_PASSWORD=%q\n' "${ADMIN_PASSWORD}"
  printf 'ALLOW_CUSTOM_COMMANDS=%q\n' "${ALLOW_CUSTOM_COMMANDS}"
  printf 'SCHEDULE_AM=%q\n' "${SCHEDULE_AM}"
  printf 'SCHEDULE_PM=%q\n' "${SCHEDULE_PM}"
  printf 'NETWORK_NAME=%q\n' "${NETWORK_NAME}"
  printf 'DB_VOLUME=%q\n' "${DB_VOLUME}"
} >"${ENV_FILE}"
chmod 600 "${ENV_FILE}"

echo "Building RoboWatch images with Docker..."
docker build -t "${BACKEND_IMAGE}" -f "${SOURCE_DIR}/backend/Dockerfile" "${SOURCE_DIR}/backend"
docker build -t "${FRONTEND_IMAGE}" -f "${SOURCE_DIR}/frontend/Dockerfile" "${SOURCE_DIR}/frontend"

cat >"${CONTROL_SCRIPT}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(dirname "$0")/robowatch.env"
set -a
source "${ENV_FILE}"
set +a

DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=disable"

container_exists() {
  "${RUNTIME}" container inspect "$1" >/dev/null 2>&1
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
    --restart unless-stopped \
    --network "${NETWORK_NAME}" --network-alias postgres \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -v "${DB_VOLUME}:/var/lib/postgresql/data" \
    "${POSTGRES_IMAGE}" >/dev/null

  wait_for_postgres

  "${RUNTIME}" run -d --name robowatch-backend \
    --restart unless-stopped \
    --network "${NETWORK_NAME}" --network-alias backend \
    -p "${API_PORT}:8080" \
    -e DATABASE_URL="${DATABASE_URL}" \
    -e SERVER_PORT=8080 \
    -e ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
    -e SESSION_SECRET="${SESSION_SECRET}" \
    -e ADMIN_USERNAME="${ADMIN_USERNAME}" \
    -e ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
    -e ALLOW_CUSTOM_COMMANDS="${ALLOW_CUSTOM_COMMANDS}" \
    -e SCHEDULE_AM="${SCHEDULE_AM}" \
    -e SCHEDULE_PM="${SCHEDULE_PM}" \
    "${BACKEND_IMAGE}" >/dev/null

  "${RUNTIME}" run -d --name robowatch-frontend \
    --restart unless-stopped \
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
Description=RoboWatch AMR Dashboard Docker stack
After=network-online.target docker.service
Wants=network-online.target docker.service
Requires=docker.service

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

open_firewall_port "${APP_PORT}"

HOST_IP="$(hostname -I | awk '{print $1}')"
echo
echo "RoboWatch installed."
echo "  OS:      ${PRETTY_NAME:-${OS_ID}}"
echo "  Runtime: docker"
echo "  Service: sudo systemctl status ${SERVICE_NAME}"
echo "  App:     http://${HOST_IP}:${APP_PORT}"
echo "  API:     http://${HOST_IP}:${API_PORT}/api"
echo "  Login:   ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}"
echo "  Config:  ${ENV_FILE}"
echo
echo "Useful commands:"
echo "  sudo ${CONTROL_SCRIPT} status"
echo "  sudo systemctl restart ${SERVICE_NAME}"
