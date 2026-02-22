import sqlite3
import os
import threading

DB_PATH = os.path.join(os.path.dirname(__file__), "pump.db")

_lock = threading.Lock()
_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.execute("PRAGMA journal_mode=WAL")
_conn.executescript("""
    CREATE TABLE IF NOT EXISTS pump_events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        action    TEXT    NOT NULL,
        reason    TEXT    NOT NULL,
        timestamp TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sensor_readings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        distance_cm REAL    NOT NULL,
        level_pct   REAL    NOT NULL,
        recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
""")
_conn.commit()


def insert_event(action: str, reason: str):
    with _lock:
        _conn.execute("INSERT INTO pump_events (action, reason) VALUES (?, ?)", (action, reason))
        _conn.commit()


def get_recent_events():
    rows = _conn.execute("SELECT * FROM pump_events ORDER BY id DESC LIMIT 50").fetchall()
    return [dict(r) for r in rows]


def insert_reading(distance_cm: float, level_pct: float):
    with _lock:
        _conn.execute(
            "INSERT INTO sensor_readings (distance_cm, level_pct) VALUES (?, ?)",
            (distance_cm, level_pct),
        )
        _conn.commit()


def get_latest_reading():
    row = _conn.execute("SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 1").fetchone()
    return dict(row) if row else None


def get_readings_by_day(tz_mod: str, date: str):
    rows = _conn.execute(
        """
        SELECT
            CAST(strftime('%H', datetime(recorded_at, ?)) AS INTEGER) AS hour,
            ROUND(AVG(level_pct), 1)                                  AS level_pct,
            COUNT(*)                                                   AS count
        FROM sensor_readings
        WHERE date(datetime(recorded_at, ?)) = ?
        GROUP BY hour
        ORDER BY hour
        """,
        (tz_mod, tz_mod, date),
    ).fetchall()
    return [dict(r) for r in rows]


def get_readings_by_hour(tz_mod: str, date: str, hour: int):
    rows = _conn.execute(
        """
        SELECT
            CAST(strftime('%M', datetime(recorded_at, ?)) AS INTEGER) AS minute,
            ROUND(AVG(level_pct), 1)                                  AS level_pct,
            COUNT(*)                                                   AS count
        FROM sensor_readings
        WHERE date(datetime(recorded_at, ?)) = ?
          AND CAST(strftime('%H', datetime(recorded_at, ?)) AS INTEGER) = ?
        GROUP BY minute
        ORDER BY minute
        """,
        (tz_mod, tz_mod, date, tz_mod, hour),
    ).fetchall()
    return [dict(r) for r in rows]
