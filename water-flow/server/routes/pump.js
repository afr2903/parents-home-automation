const express = require("express");
const { insertEvent, getRecentEvents, getLatestReading } = require("../db");

const router = express.Router();

// ── Thresholds ────────────────────────────────────────────────────────
// In auto mode the pump turns ON below LOW and OFF above HIGH.
// The band between them prevents rapid on/off cycling (hysteresis).
const LOW_THRESHOLD  = 20;  // % — pump turns ON when level drops below this
const HIGH_THRESHOLD = 90;  // % — pump turns OFF when level rises above this

// How old a sensor reading can be before it's considered stale (ms)
const STALE_READING_MS = 60 * 1000;  // 60 seconds

// ── Safety ────────────────────────────────────────────────────────────
// Hard cap on how long the pump can run continuously, regardless of mode.
// Protects against a stuck sensor reading or a leak preventing the tank
// from ever reaching HIGH_THRESHOLD.
const MAX_PUMP_RUNTIME_MS = 30 * 60 * 1000;  // 30 minutes — change this to adjust

// ── In-memory pump state ──────────────────────────────────────────────
// mode: "auto"       — server drives pump based on sensor level
//       "manual_on"  — user forced pump ON
//       "manual_off" — user forced pump OFF
let pumpState = {
  pump_on: false,
  mode: "auto",
  reason: "server_start",
  since: new Date().toISOString(),
  last_esp_poll: null,
};

insertEvent.run("off", "server_start");

// ── Safety + auto mode logic ──────────────────────────────────────────
// Called before every command/status response so the state is always fresh.
function evaluateAutoMode() {
  // Safety rule 1: max runtime — applies in any mode.
  // If the pump has been ON for longer than MAX_PUMP_RUNTIME_MS, force it OFF
  // and return to auto so normal thresholds resume once the tank fills.
  if (pumpState.pump_on) {
    const onFor = Date.now() - new Date(pumpState.since).getTime();
    if (onFor > MAX_PUMP_RUNTIME_MS) {
      pumpState.pump_on = false;
      pumpState.mode    = "auto";
      pumpState.reason  = "safety:max_runtime";
      pumpState.since   = new Date().toISOString();
      insertEvent.run("off", "safety:max_runtime");
      return;
    }
  }

  if (pumpState.mode !== "auto") return;

  const reading = getLatestReading.get();
  const age     = reading
    ? Date.now() - new Date(reading.recorded_at + "Z").getTime()
    : Infinity;

  // Safety rule 2: sensor offline — if data is absent or stale, turn pump OFF.
  // Do not run blind.
  if (!reading || age > STALE_READING_MS) {
    if (pumpState.pump_on) {
      pumpState.pump_on = false;
      pumpState.reason  = "safety:sensor_offline";
      pumpState.since   = new Date().toISOString();
      insertEvent.run("off", "safety:sensor_offline");
    }
    return;
  }

  // Normal hysteresis: turn ON when low, OFF when high, hold state in between.
  const level = reading.level_pct;
  if (level <= LOW_THRESHOLD && !pumpState.pump_on) {
    pumpState.pump_on = true;
    pumpState.reason  = "auto:low_level";
    pumpState.since   = new Date().toISOString();
    insertEvent.run("on", "auto:low_level");
  } else if (level >= HIGH_THRESHOLD && pumpState.pump_on) {
    pumpState.pump_on = false;
    pumpState.reason  = "auto:high_level";
    pumpState.since   = new Date().toISOString();
    insertEvent.run("off", "auto:high_level");
  }
}

// ── Routes ────────────────────────────────────────────────────────────

// GET /api/pump/command — polled by ESP32 #2 (garage/pump node)
router.get("/command", (req, res) => {
  pumpState.last_esp_poll = new Date().toISOString();
  evaluateAutoMode();
  res.json({
    pump_on: pumpState.pump_on,
    reason:  pumpState.reason,
    since:   pumpState.since,
  });
});

// POST /api/pump/override — manual control from dashboard
// action: "on" | "off" | "auto"
router.post("/override", (req, res) => {
  const { action } = req.body;

  if (action === "auto") {
    pumpState.mode   = "auto";
    pumpState.reason = "return_to_auto";
    pumpState.since  = new Date().toISOString();
    evaluateAutoMode();
    return res.json({ changed: true, ...pumpState });
  }

  if (action !== "on" && action !== "off") {
    return res.status(400).json({ error: 'action must be "on", "off", or "auto"' });
  }

  const desired = action === "on";
  pumpState.mode    = desired ? "manual_on" : "manual_off";
  pumpState.pump_on = desired;
  pumpState.reason  = "manual";
  pumpState.since   = new Date().toISOString();
  insertEvent.run(action, "manual");

  res.json({ changed: true, ...pumpState });
});

// GET /api/pump/status — full state for dashboard (includes latest sensor reading)
router.get("/status", (req, res) => {
  evaluateAutoMode();
  const sensor = getLatestReading.get() || null;
  res.json({
    ...pumpState,
    sensor,
    recent_events: getRecentEvents.all(),
  });
});

module.exports = router;
