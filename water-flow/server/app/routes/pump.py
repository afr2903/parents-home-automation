from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app.auth import require_api_key, require_oauth
from app.db import get_latest_reading, get_recent_events, insert_event, insert_pump_heartbeat
from app.pump_logic import evaluate_auto_mode, now_iso
from app.pump_state import lock, state

pump_bp = Blueprint("pump", __name__)


@pump_bp.route("/command")
@require_api_key("PUMP_API_KEY")
def get_command():
    """ESP32 polling endpoint — returns current pump command."""
    insert_pump_heartbeat()
    with lock:
        state["last_esp_poll"] = now_iso()
        evaluate_auto_mode()
        return jsonify({k: state[k] for k in ("pump_on", "reason", "since")})


@pump_bp.route("/override", methods=["POST"])
@require_oauth
def post_override():
    """Dashboard manual control — action: 'on' | 'off' | 'auto'."""
    body = request.get_json()
    if not body or "action" not in body:
        return jsonify({"error": "action is required"}), 400
    action = body["action"]
    if action not in ("on", "off", "auto"):
        return jsonify({"error": 'action must be "on", "off", or "auto"'}), 400
    with lock:
        state["timer_end"] = None  # any manual override cancels the timer
        if action == "auto":
            state["mode"]   = "auto"
            state["reason"] = "return_to_auto"
            state["since"]  = now_iso()
            evaluate_auto_mode()
            return jsonify({"changed": True, **state})
        state["mode"]    = "manual_on" if action == "on" else "manual_off"
        state["pump_on"] = action == "on"
        state["reason"]  = "manual"
        state["since"]   = now_iso()
        insert_event(action, "manual")
        return jsonify({"changed": True, **state})


@pump_bp.route("/status")
@require_oauth
def get_status():
    """Full pump state for the dashboard."""
    with lock:
        evaluate_auto_mode()
        return jsonify({**state, "sensor": get_latest_reading(), "recent_events": get_recent_events()})


@pump_bp.route("/timer", methods=["POST"])
@require_oauth
def post_timer():
    """Start or cancel a server-side countdown. seconds=0 cancels."""
    body = request.get_json()
    if not body or "seconds" not in body:
        return jsonify({"error": "seconds is required"}), 400
    seconds = body["seconds"]
    if not isinstance(seconds, (int, float)):
        return jsonify({"error": "seconds must be a number"}), 400
    seconds = int(seconds)
    if seconds < 0 or (seconds > 0 and seconds > 7200):
        return jsonify({"error": "seconds must be 0 (cancel) or 1-7200"}), 400
    with lock:
        if seconds <= 0:
            state["timer_end"] = None
            state["pump_on"]   = False
            state["mode"]      = "auto"
            state["reason"]    = "timer_cancelled"
            state["since"]     = now_iso()
            insert_event("off", "timer_cancelled")
            return jsonify({"ok": True})
        state["timer_end"] = (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
        state["pump_on"]   = True
        state["mode"]      = "manual_on"
        state["reason"]    = "timer"
        state["since"]     = now_iso()
        insert_event("on", "timer")
        return jsonify({"ok": True})
