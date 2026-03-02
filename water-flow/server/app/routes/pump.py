from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app.db import get_latest_reading, get_recent_events, insert_event
from app.pump_logic import evaluate_auto_mode, now_iso
from app.pump_state import lock, state

pump_bp = Blueprint("pump", __name__)


@pump_bp.route("/command")
def get_command():
    """ESP32 polling endpoint — returns current pump command."""
    with lock:
        state["last_esp_poll"] = now_iso()
        evaluate_auto_mode()
        return jsonify({k: state[k] for k in ("pump_on", "reason", "since")})


@pump_bp.route("/override", methods=["POST"])
def post_override():
    """Dashboard manual control — action: 'on' | 'off' | 'auto'."""
    action = request.get_json().get("action")
    with lock:
        state["timer_end"] = None  # any manual override cancels the timer
        if action == "auto":
            state["mode"]   = "auto"
            state["reason"] = "return_to_auto"
            state["since"]  = now_iso()
            evaluate_auto_mode()
            return jsonify({"changed": True, **state})
        if action not in ("on", "off"):
            return jsonify({"error": 'action must be "on", "off", or "auto"'}), 400
        state["mode"]    = "manual_on" if action == "on" else "manual_off"
        state["pump_on"] = action == "on"
        state["reason"]  = "manual"
        state["since"]   = now_iso()
        insert_event(action, "manual")
        return jsonify({"changed": True, **state})


@pump_bp.route("/status")
def get_status():
    """Full pump state for the dashboard."""
    with lock:
        evaluate_auto_mode()
        return jsonify({**state, "sensor": get_latest_reading(), "recent_events": get_recent_events()})


@pump_bp.route("/timer", methods=["POST"])
def post_timer():
    """Start or cancel a server-side countdown. seconds=0 cancels."""
    seconds = request.get_json().get("seconds", 0)
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
