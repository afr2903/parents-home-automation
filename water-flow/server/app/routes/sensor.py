import re

from flask import Blueprint, jsonify, request

from app.db import get_latest_reading, get_readings_by_day, get_readings_by_hour, insert_reading

sensor_bp = Blueprint("sensor", __name__)

TANK_RADIUS_CM       = 50   # cylinder radius in cm — adjust to your tank
TANK_WATER_HEIGHT_CM = 55   # usable water column height in cm
TZ_OFFSET_HOURS      = -6   # CST (Mexico) = UTC-6; CDT (summer) = UTC-5
_TZ_MOD              = f"{'+' if TZ_OFFSET_HOURS >= 0 else ''}{TZ_OFFSET_HOURS} hours"


@sensor_bp.route("/reading", methods=["POST"])
def post_reading():
    """Tank ESP32 sensor upload — called every ~10 s."""
    body        = request.get_json()
    distance_cm = body.get("distance_cm")
    level_pct   = body.get("level_pct")
    if not isinstance(distance_cm, (int, float)) or not isinstance(level_pct, (int, float)):
        return jsonify({"error": "distance_cm and level_pct must be numbers"}), 400
    insert_reading(distance_cm, level_pct)
    return jsonify({"ok": True})


@sensor_bp.route("/latest")
def get_latest():
    return jsonify({"reading": get_latest_reading()})


@sensor_bp.route("/config")
def get_config():
    return jsonify({
        "TANK_RADIUS_CM":       TANK_RADIUS_CM,
        "TANK_WATER_HEIGHT_CM": TANK_WATER_HEIGHT_CM,
        "TZ_OFFSET_HOURS":      TZ_OFFSET_HOURS,
    })


@sensor_bp.route("/history")
def get_history():
    """?date=YYYY-MM-DD[&hour=0-23] — hourly or per-minute averages."""
    date = request.args.get("date", "")
    hour = request.args.get("hour")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    if hour is not None:
        try:
            h = int(hour)
        except ValueError:
            return jsonify({"error": "hour must be 0-23"}), 400
        if h < 0 or h > 23:
            return jsonify({"error": "hour must be 0-23"}), 400
        return jsonify({"date": date, "hour": h, "readings": get_readings_by_hour(_TZ_MOD, date, h)})
    return jsonify({"date": date, "readings": get_readings_by_day(_TZ_MOD, date)})
