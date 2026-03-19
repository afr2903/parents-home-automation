<p align="center">
  <picture>
    <img alt="Water Flow logo" src="./dashboard/pump-logo.jpg" width="170" height="170" style="max-width: 100%;">
  </picture>
  <br/>
  <br/>
</p>

# Water Flow Automation

Home automation system to keep a water tank filled automatically, with manual control from a mobile-friendly dashboard. Hosted on Fly.io

## What this project does

- Reads tank level from a sensor ESP32 (ultrasonic distance).
- Decides when the pump should be ON/OFF on a cloud Flask server.
- Sends commands to a pump ESP32 connected to the relay.
- Lets humans monitor level/history/stats and override behavior from the dashboard.
- Requires Google OAuth to access the dashboard; ESP32 devices authenticate with API keys.

## Architecture

```
Tank Sensor ESP32 ──HTTPS──► Flask API (Fly.io) ──► SQLite (Fly.io Volume)
                                    │
                             Pump Logic / Rules
                                    │
Pump ESP32 ◄──HTTPS── Flask API ◄───┘

Dashboard (Fly.io) ◄──HTTPS──► Flask API (Google OAuth-protected)
```

## Components

### `tank/tank.ino` — Sensor ESP32
- Reads ultrasonic distance, converts to water level %.
- POSTs readings every 60 s to `/api/sensor/reading` with Bearer API key.
- TLS via `WiFiClientSecure` + NTP time sync on boot.

### `pump/pump.ino` — Pump ESP32
- Polls `GET /api/pump/command` every 30 s with Bearer API key.
- Drives relay pin HIGH/LOW based on server command.
- Fail-safe: turns OFF if server unreachable for >2 min.

### `server/` — Flask API
- Stores readings/events in SQLite on a persistent Fly.io Volume.
- Runs auto logic (fill thresholds, safety rules) in `app/pump_state.py`.
- Authentication:
  - ESP32 endpoints: Bearer API key (`TANK_API_KEY` / `PUMP_API_KEY`)
  - Dashboard endpoints: Google ID token (verified via `GOOGLE_CLIENT_ID`, email allowlisted via `ALLOWED_EMAILS`)
- Rate limiting: 60 req/min per blueprint.
- Endpoints:
  - Pump: `GET /api/pump/command`, `GET /api/pump/status`, `POST /api/pump/override`, `POST /api/pump/timer`
  - Sensor: `POST /api/sensor/reading`, `GET /api/sensor/latest`, `GET /api/sensor/config`, `GET /api/sensor/history`
  - Stats: `GET /api/stats/water`, `GET /api/stats/uptime`

### `dashboard/` — React + Vite UI
- **Control tab**: live tank level, pump mode, force ON/OFF, countdown timer.
- **History tab**: daily and per-hour level charts; tap a point to zoom into that hour; ‹/› buttons to move between hours without going back to the day view.
- **Statistics tab**: 7-day water usage, hourly patterns, day-of-week patterns, system uptime rings.
- Google Sign-In gate; token stored in `localStorage`, auto-cleared on expiry.

## Quick start (local development)

### 1. Run the backend

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
TANK_API_KEY=localkey PUMP_API_KEY=localkey \
  GOOGLE_CLIENT_ID=<your-client-id> ALLOWED_EMAILS=you@example.com \
  python main.py
```

Backend runs on `http://localhost:3001`.

### 2. Run the dashboard

```bash
cd dashboard
cp .env.example .env.development   # fill in VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Dashboard runs on `http://localhost:5173` (proxies `/api/*` to Flask in dev).

### 3. Flash the ESP32 sketches

Fill in `tank/secrets.h` and `pump/secrets.h` (never committed):

```cpp
#define WIFI_SSID     "YourNetwork"
#define WIFI_PASSWORD "YourPassword"
#define API_KEY       "your-api-key-here"
```

Then flash `tank/tank.ino` and `pump/pump.ino` via Arduino IDE.

## Deploying to Fly.io

See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) for the full step-by-step. In short:

```bash
./scripts/setup.sh     # One-time: create Fly apps, volume, set secrets
./scripts/deploy.sh    # Deploy both server and dashboard
```

The server runs always-on (machine never stops); the dashboard auto-stops between requests.

## Project structure

```
water-flow/
├── dashboard/              # React UI (Control + History + Statistics)
│   ├── src/
│   │   ├── App.jsx         # Auth gate, tab routing
│   │   ├── components/     # ControlTab, HistoryTab, StatsTab, LevelChart, TankVisual
│   │   └── utils/          # api.js, format.js, tank.js
│   ├── Dockerfile          # nginx multi-stage build
│   └── fly.toml
├── pump/
│   ├── pump.ino            # Pump ESP32 firmware
│   └── secrets.h           # WiFi + API key (gitignored)
├── server/
│   ├── app/
│   │   ├── auth.py         # API key + Google OAuth decorators
│   │   ├── db.py           # SQLite setup, reading storage
│   │   ├── pump_state.py   # Auto/manual mode logic, thresholds
│   │   ├── pump_logic.py   # Rule evaluation
│   │   └── routes/         # pump.py, sensor.py, stats.py
│   ├── Dockerfile
│   └── fly.toml
├── tank/
│   ├── tank.ino            # Tank sensor ESP32 firmware
│   └── secrets.h           # WiFi + API key (gitignored)
├── scripts/
│   ├── setup.sh            # Fly.io first-time provisioning
│   └── deploy.sh           # Deploy server and/or dashboard
├── utils/
│   └── wifi-scanner/       # Utility sketch to scan available networks
├── DEPLOYMENT-GUIDE.md
└── ESP32-CONNECTIVITY-LEARNINGS.md  # TLS/HTTPS debugging notes
```

## Notes

- Auto-control thresholds: `server/app/pump_state.py`.
- ESP32 TLS: uses `WiFiClientSecure` with `setInsecure()` — traffic is encrypted but server cert is not verified (Fly.io serves an ECDSA chain that ESP32's mbedTLS can't verify). See `ESP32-CONNECTIVITY-LEARNINGS.md` for details.
- Add the dashboard to your home screen on mobile — it uses `pump-logo.jpg` as the PWA icon.
