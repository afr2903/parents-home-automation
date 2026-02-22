import re

from flask import Blueprint, request, jsonify

import db

sensor_bp = Blueprint("sensor", __name__)

# ── Tank physical constants ────────────────────────────────────────────
TANK_RADIUS_CM       = 50   # cylinder radius in cm — adjust to your tank
TANK_WATER_HEIGHT_CM = 55   # usable water column height in cm

# ── Timezone ──────────────────────────────────────────────────────────
# Readings are stored in UTC. This offset shifts them to local time so
# that "today" in the History tab matches the wall clock.
# CST (Mexico) = UTC-6.  CDT (summer) = UTC-5 — update if needed.
TZ_OFFSET_HOURS = -6
_tz_mod = f"{'+' if TZ_OFFSET_HOURS >= 0 else ''}{TZ_OFFSET_HOURS} hours"


# POST /api/sensor/reading — called by ESP32 #1 (tank node) every ~10s
@sensor_bp.route("/reading", methods=["POST"])
def post_reading():
    body = request.get_json()
    distance_cm = body.get("distance_cm")
    level_pct = body.get("level_pct")

    if not isinstance(distance_cm, (int, float)) or not isinstance(level_pct, (int, float)):
        return jsonify({"error": "distance_cm and level_pct must be numbers"}), 400

    db.insert_reading(distance_cm, level_pct)
    return jsonify({"ok": True})


# GET /api/sensor/latest — latest reading for the dashboard or debugging
@sensor_bp.route("/latest")
def get_latest():
    return jsonify({"reading": db.get_latest_reading()})


# GET /api/sensor/config — tank physical config for litre calculation
@sensor_bp.route("/config")
def get_config():
    return jsonify({
        "TANK_RADIUS_CM":       TANK_RADIUS_CM,
        "TANK_WATER_HEIGHT_CM": TANK_WATER_HEIGHT_CM,
        "TZ_OFFSET_HOURS":      TZ_OFFSET_HOURS,
    })


# GET /api/sensor/history?date=YYYY-MM-DD[&hour=0-23]
# Without hour: returns hourly averages for the whole day (max 24 rows).
# With hour:    returns per-minute averages for that hour (max 60 rows).
@sensor_bp.route("/history")
def get_history():
    date = request.args.get("date")
    hour = request.args.get("hour")

    if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400

    if hour is not None:
        try:
            h = int(hour)
        except ValueError:
            return jsonify({"error": "hour must be 0-23"}), 400
        if h < 0 or h > 23:
            return jsonify({"error": "hour must be 0-23"}), 400
        readings = db.get_readings_by_hour(_tz_mod, date, h)
        return jsonify({"date": date, "hour": h, "readings": readings})

    readings = db.get_readings_by_day(_tz_mod, date)
    return jsonify({"date": date, "readings": readings})
