import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import db

router = APIRouter()

# ── Tank physical constants ────────────────────────────────────────────
TANK_RADIUS_CM       = 50   # cylinder radius in cm — adjust to your tank
TANK_WATER_HEIGHT_CM = 55   # usable water column height in cm

# ── Timezone ──────────────────────────────────────────────────────────
# Readings are stored in UTC. This offset shifts them to local time so
# that "today" in the History tab matches the wall clock.
# CST (Mexico) = UTC-6.  CDT (summer) = UTC-5 — update if needed.
TZ_OFFSET_HOURS = -6
_tz_mod = f"{'+' if TZ_OFFSET_HOURS >= 0 else ''}{TZ_OFFSET_HOURS} hours"


class ReadingRequest(BaseModel):
    distance_cm: float
    level_pct:   float


# POST /api/sensor/reading — called by ESP32 #1 (tank node) every ~10s
@router.post("/reading")
def post_reading(body: ReadingRequest):
    db.insert_reading(body.distance_cm, body.level_pct)
    return {"ok": True}


# GET /api/sensor/latest — latest reading for the dashboard or debugging
@router.get("/latest")
def get_latest():
    return {"reading": db.get_latest_reading()}


# GET /api/sensor/config — tank physical config for litre calculation
@router.get("/config")
def get_config():
    return {
        "TANK_RADIUS_CM":       TANK_RADIUS_CM,
        "TANK_WATER_HEIGHT_CM": TANK_WATER_HEIGHT_CM,
        "TZ_OFFSET_HOURS":      TZ_OFFSET_HOURS,
    }


# GET /api/sensor/history?date=YYYY-MM-DD[&hour=0-23]
# Without hour: returns hourly averages for the whole day (max 24 rows).
# With hour:    returns per-minute averages for that hour (max 60 rows).
@router.get("/history")
def get_history(
    date: str = Query(...),
    hour: Optional[int] = Query(None),
):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    if hour is not None:
        if hour < 0 or hour > 23:
            raise HTTPException(status_code=400, detail="hour must be 0-23")
        readings = db.get_readings_by_hour(_tz_mod, date, hour)
        return {"date": date, "hour": hour, "readings": readings}

    readings = db.get_readings_by_day(_tz_mod, date)
    return {"date": date, "readings": readings}
