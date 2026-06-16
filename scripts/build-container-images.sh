#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="${CONTAINER_RUNTIME:-}"
BACKEND_IMAGE="${BACKEND_IMAGE:-robowatch-backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-robowatch-frontend:latest}"

if [[ -z "${RUNTIME}" ]]; then
  if command -v docker >/dev/null 2>&1; then
    RUNTIME="docker"
  elif command -v podman >/dev/null 2>&1; then
    RUNTIME="podman"
  else
    echo "docker or podman is required."
    exit 1
  fi
fi

echo "Building backend image: ${BACKEND_IMAGE}"
"${RUNTIME}" build -t "${BACKEND_IMAGE}" -f "${ROOT_DIR}/backend/Dockerfile" "${ROOT_DIR}/backend"

echo "Building frontend image: ${FRONTEND_IMAGE}"
"${RUNTIME}" build -t "${FRONTEND_IMAGE}" -f "${ROOT_DIR}/frontend/Dockerfile" "${ROOT_DIR}/frontend"

echo
echo "Images built:"
echo "  ${BACKEND_IMAGE}"
echo "  ${FRONTEND_IMAGE}"
echo
echo "Run with docker compose, or use:"
echo "  sudo BACKEND_IMAGE=${BACKEND_IMAGE} FRONTEND_IMAGE=${FRONTEND_IMAGE} bash scripts/install-ubuntu-containers.sh"
