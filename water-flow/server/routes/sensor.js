const express = require("express");
const { insertReading, getLatestReading } = require("../db");

const router = express.Router();

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

module.exports = router;
