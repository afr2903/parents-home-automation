from datetime import datetime, timezone

from app.db import get_latest_reading, insert_event
from app.pump_state import (
    HIGH_THRESHOLD,
    LOW_THRESHOLD,
    MAX_PUMP_RUNTIME_MS,
    STALE_READING_MS,
    state,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_age_ms(ts: str) -> float:
    """Milliseconds since a UTC timestamp string (naive or timezone-aware)."""
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() * 1000


def evaluate_auto_mode() -> None:
    """Update pump state per timer, safety rules, and sensor. Must be called under lock."""

    # Timer expiry
    if state["timer_end"] is not None and utc_age_ms(state["timer_end"]) >= 0:
        state["timer_end"] = None
        state["pump_on"]   = False
        state["mode"]      = "auto"
        state["reason"]    = "timer_done"
        state["since"]     = now_iso()
        insert_event("off", "timer_done")
        return

    # Safety: max continuous runtime (any mode)
    if state["pump_on"] and utc_age_ms(state["since"]) > MAX_PUMP_RUNTIME_MS:
        state["pump_on"] = False
        state["mode"]    = "auto"
        state["reason"]  = "safety:max_runtime"
        state["since"]   = now_iso()
        insert_event("off", "safety:max_runtime")
        return

    if state["mode"] != "auto":
        return

    reading = get_latest_reading()
    age     = utc_age_ms(reading["recorded_at"]) if reading else float("inf")

    # Safety: sensor offline
    if not reading or age > STALE_READING_MS:
        if state["pump_on"]:
            state["pump_on"] = False
            state["reason"]  = "safety:sensor_offline"
            state["since"]   = now_iso()
            insert_event("off", "safety:sensor_offline")
        return

    level = reading["level_pct"]
    if level <= LOW_THRESHOLD and not state["pump_on"]:
        state["pump_on"] = True
        state["reason"]  = "auto:low_level"
        state["since"]   = now_iso()
        insert_event("on", "auto:low_level")
    elif level >= HIGH_THRESHOLD and state["pump_on"]:
        state["pump_on"] = False
        state["reason"]  = "auto:high_level"
        state["since"]   = now_iso()
        insert_event("off", "auto:high_level")
