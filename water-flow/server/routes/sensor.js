const express = require("express");
const { insertReading, getLatestReading, getReadingsByDay, getReadingsByHour } = require("../db");

const router = express.Router();

// ── Tank physical constants ────────────────────────────────────────────
// Used to convert water level % → litres in the dashboard.
// Adjust TANK_RADIUS_CM to match your physical tank (cylinder radius).
// TANK_WATER_HEIGHT_CM should equal EMPTY_DISTANCE_CM - FULL_DISTANCE_CM
// from tank.ino (default: 70 - 15 = 55 cm).
const TANK_RADIUS_CM       = 50;   // cylinder radius in cm — adjust to your tank
const TANK_WATER_HEIGHT_CM = 55;   // usable water column height in cm

// ── Timezone ──────────────────────────────────────────────────────────
// Readings are stored in UTC. This offset shifts them to local time so
// that "today" in the History tab matches the wall clock.
// CST (Mexico) = UTC-6.  CDT (summer) = UTC-5 — update if needed.
const TZ_OFFSET_HOURS = -6;
const tzMod = `${TZ_OFFSET_HOURS >= 0 ? "+" : ""}${TZ_OFFSET_HOURS} hours`;

// POST /api/sensor/reading — called by ESP32 #1 (tank node) every ~10s
router.post("/reading", (req, res) => {
  const { distance_cm, level_pct } = req.body;

  if (typeof distance_cm !== "number" || typeof level_pct !== "number") {
    return res.status(400).json({ error: "distance_cm and level_pct must be numbers" });
  }

  insertReading.run(distance_cm, level_pct);
  res.json({ ok: true });
});

// GET /api/sensor/latest — latest reading for the dashboard or debugging
router.get("/latest", (req, res) => {
  const reading = getLatestReading.get();
  res.json({ reading: reading || null });
});

// GET /api/sensor/config — tank physical config for litre calculation
router.get("/config", (req, res) => {
  res.json({ TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM, TZ_OFFSET_HOURS });
});

// GET /api/sensor/history?date=YYYY-MM-DD[&hour=0-23]
// Without hour: returns hourly averages for the whole day (max 24 rows).
// With hour:    returns per-minute averages for that hour (max 60 rows).
router.get("/history", (req, res) => {
  const { date, hour } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }

  if (hour !== undefined) {
    const h = parseInt(hour, 10);
    if (isNaN(h) || h < 0 || h > 23) {
      return res.status(400).json({ error: "hour must be 0-23" });
    }
    const readings = getReadingsByHour.all(tzMod, tzMod, date, tzMod, h);
    return res.json({ date, hour: h, readings });
  }

  const readings = getReadingsByDay.all(tzMod, tzMod, date);
  res.json({ date, readings });
});

module.exports = router;
