#!/usr/bin/env bash
set -euo pipefail

echo "=== Water Flow Automation — Fly.io Setup ==="
echo ""

# Check prerequisites
if ! command -v fly &>/dev/null; then
  echo "Error: fly CLI not found. Install with: brew install flyctl"
  exit 1
fi

if ! fly auth whoami &>/dev/null; then
  echo "Error: Not logged in to Fly.io. Run: fly auth login"
  exit 1
fi

DASHBOARD_APP="southern-granaries-120"
SERVER_APP="southern-granaries-120-server"
REGION="dfw"

# Generate API keys
TANK_API_KEY=$(openssl rand -hex 32)
PUMP_API_KEY=$(openssl rand -hex 32)

# Prompt for configuration
read -rp "Enter allowed email addresses (comma-separated): " ALLOWED_EMAILS
read -rp "Enter Google OAuth Client ID: " GOOGLE_CLIENT_ID

echo ""
echo "Creating Fly apps..."

# Create apps (skip if exists)
if fly apps list | grep -q "$SERVER_APP"; then
  echo "  Server app already exists, skipping."
else
  fly apps create "$SERVER_APP" --org personal
  echo "  Created server app: $SERVER_APP"
fi

if fly apps list | grep -q "$DASHBOARD_APP"; then
  echo "  Dashboard app already exists, skipping."
else
  fly apps create "$DASHBOARD_APP" --org personal
  echo "  Created dashboard app: $DASHBOARD_APP"
fi

# Create volume for SQLite
echo ""
echo "Creating volume for SQLite..."
if fly volumes list -a "$SERVER_APP" 2>/dev/null | grep -q "pump_data"; then
  echo "  Volume already exists, skipping."
else
  fly volumes create pump_data --region "$REGION" --size 1 -a "$SERVER_APP" -y
  echo "  Created 1GB volume: pump_data"
fi

# Set secrets
echo ""
echo "Setting secrets on server app..."
fly secrets set \
  TANK_API_KEY="$TANK_API_KEY" \
  PUMP_API_KEY="$PUMP_API_KEY" \
  ALLOWED_EMAILS="$ALLOWED_EMAILS" \
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  ALLOWED_ORIGINS="https://${DASHBOARD_APP}.fly.dev" \
  -a "$SERVER_APP"

echo ""
echo "============================================="
echo "=== Setup Complete ==="
echo "============================================="
echo ""
echo "API Keys (save these — they won't be shown again):"
echo ""
echo "  Tank API Key:  $TANK_API_KEY"
echo "  Pump API Key:  $PUMP_API_KEY"
echo ""
echo "Paste these into your ESP32 secrets.h files:"
echo "  tank/secrets.h → #define API_KEY \"$TANK_API_KEY\""
echo "  pump/secrets.h → #define API_KEY \"$PUMP_API_KEY\""
echo ""
echo "Fly Apps:"
echo "  Dashboard: https://${DASHBOARD_APP}.fly.dev"
echo "  Server:    https://${SERVER_APP}.fly.dev"
echo ""
echo "Next steps:"
echo "  1. Set GOOGLE_CLIENT_ID in dashboard/.env.production"
echo "  2. Run: ./scripts/deploy.sh all"
