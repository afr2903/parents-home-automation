const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "pump.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS pump_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    action    TEXT    NOT NULL,  -- 'on' or 'off'
    reason    TEXT    NOT NULL,  -- 'manual', 'server_start', etc.
    timestamp TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    distance_cm REAL    NOT NULL,
    level_pct   REAL    NOT NULL,
    recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertEvent = db.prepare(
  "INSERT INTO pump_events (action, reason) VALUES (?, ?)"
);

const getRecentEvents = db.prepare(
  "SELECT * FROM pump_events ORDER BY id DESC LIMIT 50"
);

const insertReading = db.prepare(
  "INSERT INTO sensor_readings (distance_cm, level_pct) VALUES (?, ?)"
);

const getLatestReading = db.prepare(
  "SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 1"
);

module.exports = { db, insertEvent, getRecentEvents, insertReading, getLatestReading };
