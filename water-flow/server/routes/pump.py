from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import threading

import db

router = APIRouter()

# ── Thresholds ────────────────────────────────────────────────────────
LOW_THRESHOLD  = 20   # % — pump turns ON when level drops below this
HIGH_THRESHOLD = 90   # % — pump turns OFF when level rises above this

# How old a sensor reading can be before it's considered stale (ms)
STALE_READING_MS = 60 * 1000  # 60 seconds

# ── Safety ────────────────────────────────────────────────────────────
# Hard cap on how long the pump can run continuously, regardless of mode.
MAX_PUMP_RUNTIME_MS = 30 * 60 * 1000  # 30 minutes

# ── In-memory pump state ──────────────────────────────────────────────
_lock = threading.Lock()
pump_state = {
    "pump_on":       False,
    "mode":          "auto",
    "reason":        "server_start",
    "since":         datetime.now(timezone.utc).isoformat(),
    "last_esp_poll": None,
}

db.insert_event("off", "server_start")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _age_ms(utc_iso: str) -> float:
    """Milliseconds elapsed since a UTC ISO timestamp."""
    dt = datetime.fromisoformat(utc_iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() * 1000


def _reading_age_ms(recorded_at: str) -> float:
    """Age of a SQLite UTC timestamp (stored without tzinfo, e.g. '2024-01-01 12:00:00')."""
    dt = datetime.fromisoformat(recorded_at).replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() * 1000


# ── Safety + auto mode logic ──────────────────────────────────────────
# Must be called while holding _lock.
def _evaluate_auto_mode():
    # Safety rule 1: max runtime — applies in any mode.
    if pump_state["pump_on"]:
        if _age_ms(pump_state["since"]) > MAX_PUMP_RUNTIME_MS:
            pump_state["pump_on"] = False
            pump_state["mode"]    = "auto"
            pump_state["reason"]  = "safety:max_runtime"
            pump_state["since"]   = _now_iso()
            db.insert_event("off", "safety:max_runtime")
            return

    if pump_state["mode"] != "auto":
        return

    reading = db.get_latest_reading()
    age = _reading_age_ms(reading["recorded_at"]) if reading else float("inf")

    # Safety rule 2: sensor offline — turn pump OFF if data is absent or stale.
    if not reading or age > STALE_READING_MS:
        if pump_state["pump_on"]:
            pump_state["pump_on"] = False
            pump_state["reason"]  = "safety:sensor_offline"
            pump_state["since"]   = _now_iso()
            db.insert_event("off", "safety:sensor_offline")
        return

    # Normal hysteresis: turn ON when low, OFF when high, hold state in between.
    level = reading["level_pct"]
    if level <= LOW_THRESHOLD and not pump_state["pump_on"]:
        pump_state["pump_on"] = True
        pump_state["reason"]  = "auto:low_level"
        pump_state["since"]   = _now_iso()
        db.insert_event("on", "auto:low_level")
    elif level >= HIGH_THRESHOLD and pump_state["pump_on"]:
        pump_state["pump_on"] = False
        pump_state["reason"]  = "auto:high_level"
        pump_state["since"]   = _now_iso()
        db.insert_event("off", "auto:high_level")


# ── Routes ────────────────────────────────────────────────────────────

# GET /api/pump/command — polled by ESP32 #2 (garage/pump node)
@router.get("/command")
def get_command():
    with _lock:
        pump_state["last_esp_poll"] = _now_iso()
        _evaluate_auto_mode()
        return {
            "pump_on": pump_state["pump_on"],
            "reason":  pump_state["reason"],
            "since":   pump_state["since"],
        }


class OverrideRequest(BaseModel):
    action: str


# POST /api/pump/override — manual control from dashboard
# action: "on" | "off" | "auto"
@router.post("/override")
def post_override(body: OverrideRequest):
    action = body.action
    with _lock:
        if action == "auto":
            pump_state["mode"]   = "auto"
            pump_state["reason"] = "return_to_auto"
            pump_state["since"]  = _now_iso()
            _evaluate_auto_mode()
            return {"changed": True, **pump_state}

        if action not in ("on", "off"):
            raise HTTPException(status_code=400, detail='action must be "on", "off", or "auto"')

        desired = action == "on"
        pump_state["mode"]    = "manual_on" if desired else "manual_off"
        pump_state["pump_on"] = desired
        pump_state["reason"]  = "manual"
        pump_state["since"]   = _now_iso()
        db.insert_event(action, "manual")

        return {"changed": True, **pump_state}


# GET /api/pump/status — full state for dashboard (includes latest sensor reading)
@router.get("/status")
def get_status():
    with _lock:
        _evaluate_auto_mode()
        return {
            **pump_state,
            "sensor":        db.get_latest_reading(),
            "recent_events": db.get_recent_events(),
        }
