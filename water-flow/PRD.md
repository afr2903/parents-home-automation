# Water Pump Automation System - Product Requirements Document

## 1. Problem Statement

The house has a water pump in the garage that fills a water tank on the roof. Today the process is entirely manual: someone notices there's no water, walks to the garage, plugs in the pump, sets a 15-minute timer, then walks back to unplug it. This is inconvenient, error-prone (forgetting the pump on wastes water and can overflow the tank; forgetting to turn it on leaves the house without water), and impossible to do remotely.

## 2. Goal

Build a fully automated, locally-hosted system that:

1. Monitors the water level in the roof tank in real time.
2. Automatically turns the pump on when the tank is low and off when it's full.
3. Provides a local web dashboard for monitoring, manual override, and basic analytics.
4. Runs entirely on the home WiFi network with no cloud dependency.

## 3. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Home WiFi Network                        │
│                                                                 │
│  ┌──────────────┐     HTTP POST      ┌──────────────────────┐  │
│  │  ESP32 #1    │ ──────────────────> │                      │  │
│  │  (Roof/Tank) │   sensor readings   │   Local API Server   │  │
│  │  JSN SR04T   │                     │   (e.g. Raspberry Pi │  │
│  └──────────────┘                     │    or any always-on  │  │
│                                       │    device on network) │  │
│  ┌──────────────┐     HTTP GET        │                      │  │
│  │  ESP32 #2    │ <────────────────── │   - REST API         │  │
│  │  (Garage/    │   pump command      │   - Web Dashboard    │  │
│  │   Pump)      │   (on/off)          │   - SQLite DB        │  │
│  │  Relay       │                     │                      │  │
│  └──────────────┘                     └──────────────────────┘  │
│                                              ▲                  │
│                                              │ HTTP             │
│                                        ┌─────┴──────┐          │
│                                        │  Browser    │          │
│                                        │  (phone/    │          │
│                                        │   laptop)   │          │
│                                        └────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Components

| Component | Hardware | Location | Role |
|-----------|----------|----------|------|
| Tank Sensor Node | ESP32-D0WD-V3 + JSN SR04T | Roof (near tank) | Reads water distance, publishes to API |
| Pump Controller Node | ESP32-D0WD-V3 + Relay module | Garage (near pump) | Polls API for commands, switches pump relay |
| API Server | Any always-on device on the network (Raspberry Pi, old laptop, NAS, etc.) | Indoors | Middleware: receives readings, decides pump state, serves dashboard |

## 4. Hardware

### 4.1 ESP32 Boards (x2)

- **Chip:** ESP32-D0WD-V3 (revision v3.1)
- **Features:** Wi-Fi, BT, Dual Core + LP Core, 240MHz
- **Crystal:** 40MHz
- **esptool version:** v5.1.0
- **Serial port (dev):** /dev/cu.usbserial-1140

### 4.2 JSN SR04T Ultrasonic Sensor

- Waterproof ultrasonic distance sensor, suitable for outdoor/wet environments.
- Mounted at the top of the tank, pointing downward at the water surface.
- Measuring range: ~25cm to ~450cm.
- Output: distance in centimeters (shorter distance = more water, longer distance = less water).
- Already wired to ESP32 #1: trigger on GPIO 13, echo on GPIO 12.

### 4.3 Relay Module

- Single-channel relay module rated for the pump's voltage/current.
- Connected to ESP32 #2 on a GPIO pin (TBD during implementation).
- Controls the pump power circuit: relay ON = pump runs, relay OFF = pump stops.
- **Safety:** Normally-open (NO) configuration so the pump defaults to OFF if the ESP32 loses power or crashes.

### 4.4 Water Pump

- Existing household water pump, located in the garage.
- Currently plugged into a standard wall outlet manually.
- The relay will be wired in series with the pump's power line so the ESP32 can switch it without unplugging.

## 5. Communication Architecture

The two ESP32s **do not communicate directly** with each other. All communication goes through the local API server over the home WiFi network. This is intentional because:

- The ESP32s are physically far apart (roof vs. garage) and may not have reliable direct WiFi range.
- A central server enables logging, processing, a web UI, and manual overrides.
- Both ESP32s can reach the server since they're both on the same home WiFi.

### 5.1 ESP32 #1 (Tank Sensor) -> API Server

**Protocol:** HTTP POST over WiFi.

**Flow:**
1. ESP32 #1 connects to home WiFi on boot.
2. Every N seconds (configurable, default: 10s), it reads the JSN SR04T distance sensor.
3. It sends an HTTP POST request to the API server:

```
POST /api/sensor/reading
Content-Type: application/json

{
  "distance_cm": 87.5,
  "timestamp": 1707300000
}
```

4. The server responds with `200 OK` and optionally a new polling interval.
5. If the POST fails (server unreachable, WiFi disconnected), the ESP32 retries with exponential backoff and continues reading locally.

**Why POST from the ESP32 (push model):**
- The ESP32 initiates the connection. No need for the server to know the ESP32's IP or reach it through potential network issues.
- Simple HTTP client code on the ESP32 (Arduino `HTTPClient` library).
- The server just exposes a REST endpoint -- standard web framework stuff.

### 5.2 API Server -> ESP32 #2 (Pump Controller)

**Protocol:** HTTP GET (polling) over WiFi.

**Flow:**
1. ESP32 #2 connects to home WiFi on boot.
2. Every N seconds (configurable, default: 5s), it sends an HTTP GET request to the API server:

```
GET /api/pump/command
```

3. The server responds with:

```json
{
  "pump_on": true,
  "reason": "auto:low_level",
  "since": "2025-02-07T10:30:00Z"
}
```

4. ESP32 #2 sets the relay accordingly (HIGH = on, LOW = off).
5. If the GET fails (server unreachable), ESP32 #2 **turns the pump OFF** as a safety default and retries.

**Why polling (pull model) instead of server-push:**
- Simpler: ESP32 just does HTTP GET in a loop. No need for WebSockets, MQTT brokers, or persistent connections.
- Resilient: if the ESP32 reboots, it just starts polling again. No subscription state to manage.
- The pump doesn't need sub-second response times; a 5-second polling interval is fine.

### 5.3 Why Not MQTT?

MQTT would be a natural fit for IoT, but it adds complexity:
- Requires running an MQTT broker (e.g., Mosquitto) as an additional service.
- Adds another protocol/system to maintain.
- For a two-device system on a home network, HTTP REST is simpler and sufficient.
- Can always migrate to MQTT later if the system grows.

## 6. API Server

### 6.1 Deployment

The API server runs on **any always-on device on the home network**. Options:
- **Raspberry Pi** (recommended: low power, cheap, headless).
- An old laptop or desktop that stays on.
- A NAS if it supports Docker or Python.

The server runs as a single process (e.g., Python with FastAPI/Flask, or Node.js with Express). It binds to the device's local IP on a port (e.g., `http://192.168.x.x:8080`). All devices on the WiFi can reach it.

**To make it accessible at a friendly URL:** configure the router to assign a static IP to the server device via DHCP reservation, and optionally set up local DNS (or just bookmark the IP).

### 6.2 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sensor/reading` | Receive a distance reading from ESP32 #1 |
| `GET` | `/api/sensor/latest` | Get the latest sensor reading and computed water level |
| `GET` | `/api/pump/command` | Get current pump command (used by ESP32 #2) |
| `POST` | `/api/pump/override` | Manual override: force pump on/off or return to auto |
| `GET` | `/api/pump/status` | Get current pump state, mode (auto/manual), uptime |
| `GET` | `/api/history` | Get historical readings and pump events (for analytics) |
| `GET` | `/api/config` | Get current system configuration |
| `PUT` | `/api/config` | Update system configuration (thresholds, intervals) |
| `GET` | `/` | Serve the web dashboard (static SPA) |

### 6.3 Server-Side Logic

The server is the brain of the system. It:

1. **Receives raw distance readings** from ESP32 #1.
2. **Converts distance to water level percentage** using tank dimensions (configured once).
   - Tank is a cylinder/box with known height. Sensor is at the top.
   - `water_level_pct = ((tank_height - distance) / tank_height) * 100`
   - Distance = 0 means tank full (sensor touching water -- won't happen but logical extreme).
   - Distance = tank_height means tank empty.
3. **Applies hysteresis thresholds** to decide pump state:
   - If water level drops below **LOW threshold** (e.g., 20%) -> turn pump ON.
   - If water level rises above **HIGH threshold** (e.g., 90%) -> turn pump OFF.
   - Between thresholds, maintain current state (prevents rapid on/off cycling).
4. **Stores every reading** in a SQLite database with timestamp.
5. **Logs pump state changes** (on/off, reason, timestamp) in the database.
6. **Serves the pump command** to ESP32 #2 when polled.
7. **Respects manual overrides** from the web dashboard.

### 6.4 Data Storage

**SQLite** -- single file, zero configuration, plenty for this use case.

Tables:

```sql
sensor_readings (
  id            INTEGER PRIMARY KEY,
  distance_cm   REAL NOT NULL,
  level_pct     REAL NOT NULL,
  recorded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

pump_events (
  id            INTEGER PRIMARY KEY,
  action        TEXT NOT NULL,  -- 'on' or 'off'
  trigger       TEXT NOT NULL,  -- 'auto:low_level', 'auto:high_level', 'manual', 'safety:timeout', etc.
  started_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

config (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
)
```

## 7. Water Level Calculation

### 7.1 Tank Dimensions (to be measured)

These values must be configured once during setup:

- **Tank height (internal):** The vertical distance from the sensor to the bottom of the tank, in centimeters.
- **Sensor offset:** If the sensor is mounted above the tank opening, this offset is subtracted.
- **Minimum measurable distance:** The JSN SR04T has a dead zone (~25cm). The sensor must be mounted high enough that even at max water level, the distance is > 25cm.

### 7.2 Formula

```
effective_distance = raw_distance_cm - sensor_offset
water_height = tank_total_height - effective_distance
water_level_pct = (water_height / tank_total_height) * 100
```

### 7.3 Noise Filtering

The JSN SR04T can produce noisy/erratic readings (especially with water splashing). The server should:

- **Discard outliers:** Reject readings that deviate more than X% from the recent moving average.
- **Smoothing:** Use a rolling average of the last N readings (e.g., 5) for the displayed level and for threshold decisions.
- **Stale data detection:** If no reading arrives for > 60 seconds, mark the sensor as offline on the dashboard and apply safety behavior (see Section 9).

## 8. Pump Control Logic

### 8.1 Automatic Mode (default)

```
IF water_level_pct <= LOW_THRESHOLD (default 20%):
    pump_command = ON

IF water_level_pct >= HIGH_THRESHOLD (default 90%):
    pump_command = OFF

IF LOW_THRESHOLD < water_level_pct < HIGH_THRESHOLD:
    pump_command = (maintain previous state)
```

The hysteresis band (20%-90%) prevents the pump from cycling on and off rapidly when the level is near a threshold.

### 8.2 Manual Override Mode

From the web dashboard, a user can:
- **Force ON:** Pump turns on regardless of level. Subject to safety timeout (Section 9).
- **Force OFF:** Pump stays off regardless of level.
- **Return to Auto:** Resume automatic behavior.

Manual overrides are logged with timestamp and persist until explicitly cleared or the safety timeout triggers.

### 8.3 Configurable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `low_threshold_pct` | 20 | Below this level, pump turns ON |
| `high_threshold_pct` | 90 | Above this level, pump turns OFF |
| `sensor_read_interval_s` | 10 | How often ESP32 #1 reads and posts |
| `pump_poll_interval_s` | 5 | How often ESP32 #2 polls for commands |
| `max_pump_runtime_min` | 30 | Safety: max continuous pump run time |
| `tank_height_cm` | (TBD) | Internal height of the tank |
| `sensor_offset_cm` | 0 | Sensor mounting offset from top of tank |

## 9. Safety Requirements

These are critical to prevent hardware damage or flooding.

| Safety Rule | Behavior |
|-------------|----------|
| **Max pump runtime** | If the pump has been ON for > `max_pump_runtime_min` (default 30 min), force it OFF. This protects against a stuck sensor reading or a leak where the tank never fills. Log the event. |
| **Sensor offline** | If no sensor reading arrives for > 60 seconds, set pump to OFF and flag an alert on the dashboard. Do not run the pump blind. |
| **ESP32 #2 offline** | If ESP32 #2 hasn't polled in > 30 seconds, show it as offline on the dashboard. (The pump will already be off since the relay defaults to NO/off without signal.) |
| **Server restart** | On startup, the server defaults pump command to OFF. It reads the latest sensor data and resumes auto mode only after receiving a fresh reading. |
| **Power loss to ESP32 #2** | The relay is wired normally-open, so losing power = pump OFF. Safe default. |
| **Network failure** | If ESP32 #2 can't reach the server, it defaults to pump OFF. If ESP32 #1 can't reach the server, it keeps reading locally and retries posting. |

## 10. Web Dashboard

A single-page web application served by the API server, accessible from any device on the home WiFi at `http://<server-ip>:<port>/`.

### 10.1 Main View

- **Water level gauge:** Visual representation of current tank level (percentage + color-coded bar).
- **Pump status indicator:** ON/OFF with duration since last state change.
- **Mode indicator:** Auto / Manual (Force ON) / Manual (Force OFF).
- **Manual controls:** Buttons to Force ON, Force OFF, and Return to Auto.
- **Last reading timestamp:** Shows when the last sensor data was received.
- **Connectivity status:** Shows whether both ESP32s are online.

### 10.2 Analytics View

- **Water level over time:** Line chart showing level % over the last 24h / 7d / 30d.
- **Pump activity log:** Table of pump on/off events with timestamps, durations, and triggers.
- **Daily usage stats:** How many times the pump ran, total runtime per day.
- **Alerts history:** Any safety events (timeouts, sensor offline periods).

### 10.3 Settings View

- Edit configurable parameters (thresholds, intervals, tank dimensions).
- Changes take effect immediately (API stores them and both ESP32 behaviors adjust on next poll).

## 11. ESP32 Firmware Requirements

### 11.1 ESP32 #1 (Tank Sensor) - Firmware

**Language:** Arduino C++ (using Arduino framework for ESP32).

**Libraries:**
- `WiFi.h` -- connect to home WiFi.
- `HTTPClient.h` -- send HTTP POST requests.

**Behavior:**
1. On boot: connect to WiFi (SSID/password hardcoded or in config).
2. Loop:
   a. Read JSN SR04T distance (trigger/echo on GPIO 13/12 -- already working).
   b. POST the reading to `http://<server-ip>:<port>/api/sensor/reading`.
   c. Sleep for `sensor_read_interval_s` seconds.
3. On WiFi disconnect: attempt reconnection with backoff.
4. On HTTP failure: retry with exponential backoff (1s, 2s, 4s, 8s, max 30s).

**Configuration (compiled into firmware or served from API):**
- WiFi SSID and password.
- API server IP and port.
- Read interval.

### 11.2 ESP32 #2 (Pump Controller) - Firmware

**Language:** Arduino C++ (using Arduino framework for ESP32).

**Libraries:**
- `WiFi.h` -- connect to home WiFi.
- `HTTPClient.h` -- send HTTP GET requests.

**Behavior:**
1. On boot: connect to WiFi. Set relay GPIO to OUTPUT, LOW (pump off).
2. Loop:
   a. GET `http://<server-ip>:<port>/api/pump/command`.
   b. Parse `pump_on` boolean from JSON response.
   c. Set relay GPIO accordingly (HIGH = on, LOW = off).
   d. Sleep for `pump_poll_interval_s` seconds.
3. On WiFi disconnect: set relay LOW (pump off), attempt reconnection.
4. On HTTP failure: set relay LOW (pump off), retry with backoff.

**Safety in firmware:**
- If no successful API response in 60 seconds, ensure pump is OFF.
- Optionally: a local firmware-level max runtime (e.g., 45 min) as a second layer of defense beyond the server's 30 min limit.

## 12. Project Structure

```
water-flow/
  PRD.md                  # This document
  tank/
    tank.ino              # ESP32 #1 firmware (sensor node)
  pump/
    pump.ino              # ESP32 #2 firmware (pump controller)
  server/
    app.py                # API server (e.g., FastAPI)
    models.py             # Database models
    pump_logic.py         # Threshold logic, hysteresis, safety checks
    config.py             # Default configuration
    static/               # Web dashboard frontend
      index.html
      ...
    requirements.txt
```

## 13. Implementation Phases

### Phase 1: Sensor Node + API (vertical slice)
- Set up the API server with the `/api/sensor/reading` and `/api/sensor/latest` endpoints.
- Update `tank.ino` to connect to WiFi and POST readings to the API.
- Verify readings flow from ESP32 #1 -> server -> stored in SQLite.

### Phase 2: Pump Control
- Build the pump control logic on the server (`/api/pump/command`).
- Write the `pump.ino` firmware for ESP32 #2 with relay control and polling.
- Implement the hysteresis thresholds and safety timeout.
- Test end-to-end: low water triggers pump on, high water triggers pump off.

### Phase 3: Web Dashboard
- Build the dashboard frontend (water level gauge, pump status, manual controls).
- Implement manual override endpoints (`/api/pump/override`).
- Add settings page for configuring thresholds and tank dimensions.

### Phase 4: Analytics & Hardening
- Add historical charts (water level over time, pump activity log).
- Implement all safety rules (max runtime, sensor offline, stale data).
- Add alerting on the dashboard for anomalous events.
- Stress-test: WiFi drops, server restarts, power cycles.

## 14. Open Questions

- [ ] **Tank dimensions:** What is the internal height of the tank? Needed for level % calculation.
- [ ] **Sensor mounting height:** How far above the water surface (at max) will the sensor sit? Must be > 25cm for the JSN SR04T dead zone.
- [ ] **Relay module specs:** What relay module will be used? Need to confirm GPIO pin and whether it's active-high or active-low.
- [ ] **Server device:** What device will run the API server? (Raspberry Pi, old laptop, etc.)
- [ ] **Power supply for ESP32 on roof:** How will the roof ESP32 be powered? (USB adapter? Solar?) Needs to be weatherproof.
- [ ] **Weatherproofing:** The roof ESP32 and sensor need an enclosure for rain/sun protection.
