const express = require("express");
const { insertEvent, getRecentEvents } = require("../db");

const router = express.Router();

// ── In-memory pump state ────────────────────────────────────────────
let pumpState = {
  pump_on: false,
  reason: "server_start",
  since: new Date().toISOString(),
  last_esp_poll: null,
};

// Log initial state
insertEvent.run("off", "server_start");

// GET /api/pump/command - polled by ESP32
router.get("/command", (req, res) => {
  pumpState.last_esp_poll = new Date().toISOString();
  res.json({
    pump_on: pumpState.pump_on,
    reason: pumpState.reason,
    since: pumpState.since,
  });
});

// POST /api/pump/override - manual control from UI
router.post("/override", (req, res) => {
  const { action } = req.body;

  if (action !== "on" && action !== "off") {
    return res.status(400).json({ error: 'action must be "on" or "off"' });
  }

  const desired = action === "on";

  if (desired === pumpState.pump_on) {
    return res.json({ changed: false, ...pumpState });
  }

  pumpState.pump_on = desired;
  pumpState.reason = "manual";
  pumpState.since = new Date().toISOString();

  insertEvent.run(action, "manual");

  res.json({ changed: true, ...pumpState });
});

// GET /api/pump/status - full state for dashboard
router.get("/status", (req, res) => {
  res.json({
    ...pumpState,
    recent_events: getRecentEvents.all(),
  });
});

module.exports = router;
