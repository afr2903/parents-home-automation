#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_APP="southern-granaries-120"
SERVER_APP="southern-granaries-120-server"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
  echo "Usage: $0 {server|dashboard|all}"
  exit 1
}

deploy_server() {
  echo "=== Deploying Server ==="
  cd "$PROJECT_DIR/server"
  fly deploy -a "$SERVER_APP"
  echo ""
  echo "Checking health..."
  sleep 5
  if curl -sf "https://${SERVER_APP}.fly.dev/health" | grep -q '"ok"'; then
    echo "Server is healthy!"
  else
    echo "Warning: Health check failed. Check logs with: fly logs -a $SERVER_APP"
  fi
  echo "Server deployed: https://${SERVER_APP}.fly.dev"
}

deploy_dashboard() {
  echo "=== Deploying Dashboard ==="
  cd "$PROJECT_DIR/dashboard"
  fly deploy -a "$DASHBOARD_APP"
  echo "Dashboard deployed: https://${DASHBOARD_APP}.fly.dev"
}

case "${1:-}" in
  server)    deploy_server ;;
  dashboard) deploy_dashboard ;;
  all)
    deploy_server
    echo ""
    deploy_dashboard
    ;;
  *) usage ;;
esac
