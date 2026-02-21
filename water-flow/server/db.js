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

// Returns hourly averages for a given local date (YYYY-MM-DD).
// The first two params are the same timezone modifier (e.g. '-6 hours').
// Used by the History tab to plot water level across a day.
const getReadingsByDay = db.prepare(`
  SELECT
    CAST(strftime('%H', datetime(recorded_at, ?)) AS INTEGER) AS hour,
    ROUND(AVG(level_pct), 1)                                  AS level_pct,
    COUNT(*)                                                   AS count
  FROM sensor_readings
  WHERE date(datetime(recorded_at, ?)) = ?
  GROUP BY hour
  ORDER BY hour
`);

// Returns per-minute averages for a specific local date + hour (0-23).
// Params: tzMod, tzMod, date, tzMod, hour
// Used by the History tab when the user zooms into a single hour.
const getReadingsByHour = db.prepare(`
  SELECT
    CAST(strftime('%M', datetime(recorded_at, ?)) AS INTEGER) AS minute,
    ROUND(AVG(level_pct), 1)                                  AS level_pct,
    COUNT(*)                                                   AS count
  FROM sensor_readings
  WHERE date(datetime(recorded_at, ?)) = ?
    AND CAST(strftime('%H', datetime(recorded_at, ?)) AS INTEGER) = ?
  GROUP BY minute
  ORDER BY minute
`);

module.exports = {
  db,
  insertEvent,
  getRecentEvents,
  insertReading,
  getLatestReading,
  getReadingsByDay,
  getReadingsByHour,
};
