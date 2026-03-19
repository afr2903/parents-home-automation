# Deployment Guide: Water Flow Automation on Fly.io

All code changes are complete. Follow these steps in order to go live.

---

## Prerequisites (Manual, One-Time)

### 1. Create a Google Cloud OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth Client ID**
5. Application type: **Web application**
6. Authorized JavaScript origins:
   - `https://southern-granaries-120.fly.dev`
   - `http://localhost:5173` (for local dev)
7. Authorized redirect URIs: (same as above)
8. Copy the **Client ID** (format: `123456789-abcdef.apps.googleusercontent.com`)

### 2. Install Fly.io CLI & Login

```bash
brew install flyctl
fly auth login
```

### 3. Decide on WiFi Networks & Email Allowlist

You'll need:
- WiFi SSID + password for the **tank** ESP32 location
- WiFi SSID + password for the **pump** ESP32 location (can be same network)
- Gmail addresses for dashboard access (up to 10)

---

## Step-by-Step Deployment

### Step 1: Run the Setup Script

```bash
cd water-flow
./scripts/setup.sh
```

This will:
- Generate unique API keys for tank and pump
- Create both Fly.io apps
- Create the SQLite volume
- Set all secrets on the server

**Save the API keys** printed at the end — they won't be shown again.

### Step 2: Set Google Client ID in Dashboard Config

Edit `dashboard/.env.production`:
```
VITE_GOOGLE_CLIENT_ID=<paste your Client ID here>
```

For local development, also update `dashboard/.env.development` with the same Client ID.

### Step 3: Install Dashboard Dependencies

```bash
cd dashboard
npm install
cd ..
```

### Step 4: Deploy Server

```bash
./scripts/deploy.sh server
```

Wait for the health check to pass. Verify manually:
```bash
curl https://southern-granaries-120-server.fly.dev/health
# Expected: {"status":"ok"}
```

### Step 5: Migrate Database (Optional)

If you want to preserve historical data from the local setup:
```bash
fly ssh sftp shell -a southern-granaries-120-server
> put server/pump.db /data/pump.db
> exit

fly apps restart southern-granaries-120-server
```

Skip this step if starting fresh is acceptable.

### Step 6: Test Server Auth with curl

```bash
# Replace <TANK_KEY> and <PUMP_KEY> with keys from Step 1

# Should succeed (200):
curl -X POST https://southern-granaries-120-server.fly.dev/api/sensor/reading \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TANK_KEY>" \
  -d '{"distance_cm": 35.0, "level_pct": 70.0}'

# Should succeed (200):
curl https://southern-granaries-120-server.fly.dev/api/pump/command \
  -H "Authorization: Bearer <PUMP_KEY>"

# Should fail (401) — wrong key on wrong endpoint:
curl https://southern-granaries-120-server.fly.dev/api/pump/command \
  -H "Authorization: Bearer <TANK_KEY>"

# Should fail (401) — no key:
curl https://southern-granaries-120-server.fly.dev/api/pump/command
```

### Step 7: Deploy Dashboard

```bash
./scripts/deploy.sh dashboard
```

Visit `https://southern-granaries-120.fly.dev` — you should see the Google Sign-In screen.

### Step 8: Test Dashboard Auth

1. Sign in with an **allowed** email → dashboard should load
2. Sign in with a **disallowed** email → should get 403 and stay on sign-in

### Step 9: Flash ESP32 Firmware

**Tank ESP32:**
1. Edit `tank/secrets.h` with real values:
   ```cpp
   #define WIFI_SSID     "YourTankWiFiSSID"
   #define WIFI_PASSWORD "YourTankWiFiPassword"
   #define API_KEY       "<TANK_API_KEY from Step 1>"
   ```
2. Flash `tank/tank.ino` to the tank ESP32
3. Open Serial Monitor (115200 baud) to verify:
   - WiFi connects
   - TLS handshake succeeds (check "Free heap after TLS")
   - Readings POST successfully (HTTP 200)

**Pump ESP32:**
1. Edit `pump/secrets.h` with real values:
   ```cpp
   #define WIFI_SSID     "YourPumpWiFiSSID"
   #define WIFI_PASSWORD "YourPumpWiFiPassword"
   #define API_KEY       "<PUMP_API_KEY from Step 1>"
   ```
2. Flash `pump/pump.ino` to the pump ESP32
3. Open Serial Monitor to verify:
   - WiFi connects
   - TLS handshake succeeds
   - Pump polls successfully (HTTP 200)
   - Pump responds to commands from dashboard

### Step 10: End-to-End Verification

| Test | Expected |
|------|----------|
| Dashboard shows water level | Level updates every ~60s |
| Toggle pump ON from dashboard | Pump turns on within 30s |
| Toggle pump back to Auto | Pump follows auto logic |
| Unplug tank ESP32 | Pump turns OFF after ~3 min (safety) |
| Unplug pump ESP32 | Dashboard shows "pump offline" after ~2 min |
| Kill server (`fly apps restart`) | ESP32s retry, recover automatically |
| Leave dashboard idle 30 min | Dashboard machine auto-stops, resumes on visit |

### Step 11: Set Up Monitoring (Optional)

1. Create a free account at [UptimeRobot](https://uptimerobot.com/)
2. Add a monitor for `https://southern-granaries-120-server.fly.dev/health`
3. Set check interval to 5 minutes
4. Configure email/push alerts

---

## Useful Commands

```bash
# View server logs
fly logs -a southern-granaries-120-server

# View dashboard logs
fly logs -a southern-granaries-120

# SSH into server
fly ssh console -a southern-granaries-120-server

# Update allowed emails
fly secrets set ALLOWED_EMAILS="email1@gmail.com,email2@gmail.com" -a southern-granaries-120-server

# Rotate an API key
NEW_KEY=$(openssl rand -hex 32)
fly secrets set TANK_API_KEY="$NEW_KEY" -a southern-granaries-120-server
# Then update tank/secrets.h and re-flash the ESP32

# Backup database
fly ssh sftp shell -a southern-granaries-120-server
> get /data/pump.db ./pump-backup.db
```

---

## Rollback Plan

If anything goes wrong, the local setup still works:

1. Re-flash ESP32s with original firmware (git stash or checkout the pre-migration `.ino` files)
2. Run Flask locally: `cd server && python main.py`
3. Run dashboard locally: `cd dashboard && npm run dev`

The Fly.io deployment is additive — nothing was deleted from the local setup.

---

## Security Audit Summary

A full security audit was performed. Key findings:

| Category | Status |
|----------|--------|
| HTTPS (TLS) | All traffic encrypted, ISRG Root X1 CA pinned |
| Device auth (API keys) | Timing-safe comparison, per-endpoint enforcement |
| Dashboard auth (Google OAuth) | Token verified with audience check, email allowlist |
| CORS | Restricted to dashboard origin via env var |
| Rate limiting | Per-blueprint + global limits |
| Input validation | Range checks on all POST endpoints |
| Secrets management | .gitignored, env vars for production |
| Pump safety | Multi-layer: firmware timeout, server timeout, max runtime |
