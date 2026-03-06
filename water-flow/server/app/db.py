from __future__ import annotations

import math
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "pump.db"

_lock = threading.Lock()
_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
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
    CREATE TABLE IF NOT EXISTS pump_heartbeats (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
""")
_conn.commit()

_OFFLINE_THRESHOLD_S = 120  # 2 minutes


def insert_event(action: str, reason: str) -> None:
    with _lock:
        _conn.execute("INSERT INTO pump_events (action, reason) VALUES (?, ?)", (action, reason))
        _conn.commit()


def get_recent_events() -> list[dict]:
    return [dict(r) for r in _conn.execute("SELECT * FROM pump_events ORDER BY id DESC LIMIT 50").fetchall()]


def insert_reading(distance_cm: float, level_pct: float) -> None:
    with _lock:
        last = _conn.execute(
            "SELECT recorded_at FROM sensor_readings ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if last:
            seconds_since = _conn.execute(
                "SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)",
                (last["recorded_at"],),
            ).fetchone()[0]
            if seconds_since < 60:
                return
        _conn.execute(
            "INSERT INTO sensor_readings (distance_cm, level_pct) VALUES (?, ?)",
            (distance_cm, level_pct),
        )
        _conn.commit()


def get_latest_reading() -> dict | None:
    row = _conn.execute("SELECT * FROM sensor_readings ORDER BY id DESC LIMIT 1").fetchone()
    return dict(row) if row else None


def get_readings_by_day(tz_mod: str, date: str) -> list[dict]:
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


def get_readings_by_hour(tz_mod: str, date: str, hour: int) -> list[dict]:
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


def insert_pump_heartbeat() -> None:
    with _lock:
        last = _conn.execute(
            "SELECT recorded_at FROM pump_heartbeats ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if last:
            seconds_since = _conn.execute(
                "SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)",
                (last["recorded_at"],),
            ).fetchone()[0]
            if seconds_since < 60:
                return
        _conn.execute("INSERT INTO pump_heartbeats DEFAULT VALUES")
        _conn.commit()


def _circuit_uptime(table: str, ts_col: str, hours: int) -> dict:
    """Compute uptime stats for a circuit over the past `hours` hours."""
    window_s = hours * 3600

    rows = _conn.execute(
        f"""
        SELECT
            {ts_col} AS ts,
            CAST(
                (julianday({ts_col}) - julianday(LAG({ts_col}) OVER (ORDER BY {ts_col}))) * 86400
                AS INTEGER
            ) AS gap_s
        FROM {table}
        WHERE {ts_col} >= datetime('now', '-{hours} hours')
        ORDER BY {ts_col}
        """
    ).fetchall()

    if not rows:
        return {
            "uptime_pct": 0.0,
            "downtime_s": window_s,
            "downtime_events": 0,
            "current_status": "offline",
        }

    gap_downtime = 0
    events = 0
    for row in rows:
        g = row["gap_s"]
        if g is not None and g > _OFFLINE_THRESHOLD_S:
            gap_downtime += g - _OFFLINE_THRESHOLD_S
            events += 1

    last_ts = rows[-1]["ts"]
    current_lag = _conn.execute(
        "SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)", (last_ts,)
    ).fetchone()[0] or 0
    current_down = max(0, current_lag - _OFFLINE_THRESHOLD_S)
    if current_lag > _OFFLINE_THRESHOLD_S:
        events += 1

    first_ts = rows[0]["ts"]
    pre_lag = _conn.execute(
        f"SELECT CAST((julianday(?) - julianday(datetime('now', '-{hours} hours'))) * 86400 AS INTEGER)",
        (first_ts,),
    ).fetchone()[0] or 0
    pre_down = max(0, pre_lag - _OFFLINE_THRESHOLD_S)
    if pre_down > 0:
        events += 1

    total_down = min(gap_downtime + current_down + pre_down, window_s)
    uptime_pct = (window_s - total_down) / window_s * 100

    return {
        "uptime_pct": round(uptime_pct, 1),
        "downtime_s": total_down,
        "downtime_events": events,
        "current_status": "offline" if current_lag > _OFFLINE_THRESHOLD_S else "online",
    }


def get_uptime_stats() -> dict:
    return {
        "sensor": {
            "24h": _circuit_uptime("sensor_readings", "recorded_at", 24),
            "7d":  _circuit_uptime("sensor_readings", "recorded_at", 168),
        },
        "pump": {
            "24h": _circuit_uptime("pump_heartbeats", "recorded_at", 24),
            "7d":  _circuit_uptime("pump_heartbeats", "recorded_at", 168),
        },
    }


def get_water_stats(tz_mod: str, tank_radius_cm: float, tank_height_cm: float) -> dict:
    """Water consumption stats: daily (7 days), hourly pattern, day-of-week pattern."""
    tank_vol_l = math.pi * tank_radius_cm ** 2 * tank_height_cm / 1000  # litres at 100%

    daily = _conn.execute(
        """
        WITH diffs AS (
            SELECT
                date(datetime(recorded_at, ?))                                          AS day,
                level_pct - LAG(level_pct) OVER (ORDER BY recorded_at)                 AS delta
            FROM sensor_readings
            WHERE recorded_at >= datetime('now', '-7 days')
        )
        SELECT
            day,
            ROUND(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) * ? / 100.0, 1)     AS liters_consumed
        FROM diffs
        WHERE delta IS NOT NULL
        GROUP BY day
        ORDER BY day
        """,
        (tz_mod, tank_vol_l),
    ).fetchall()

    hourly = _conn.execute(
        """
        WITH diffs AS (
            SELECT
                date(datetime(recorded_at, ?))                                          AS day,
                CAST(strftime('%H', datetime(recorded_at, ?)) AS INTEGER)               AS hour,
                level_pct - LAG(level_pct) OVER (ORDER BY recorded_at)                 AS delta
            FROM sensor_readings
        ),
        per_day_hour AS (
            SELECT
                day, hour,
                SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END)                        AS pct_consumed
            FROM diffs
            WHERE delta IS NOT NULL
            GROUP BY day, hour
        )
        SELECT
            hour,
            ROUND(AVG(pct_consumed) * ? / 100.0, 3)                                    AS avg_liters
        FROM per_day_hour
        GROUP BY hour
        ORDER BY hour
        """,
        (tz_mod, tz_mod, tank_vol_l),
    ).fetchall()

    dow = _conn.execute(
        """
        WITH diffs AS (
            SELECT
                date(datetime(recorded_at, ?))                                          AS day,
                CAST(strftime('%w', datetime(recorded_at, ?)) AS INTEGER)               AS dow,
                level_pct - LAG(level_pct) OVER (ORDER BY recorded_at)                 AS delta
            FROM sensor_readings
        ),
        per_day AS (
            SELECT
                day, dow,
                SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END)                        AS pct_consumed
            FROM diffs
            WHERE delta IS NOT NULL
            GROUP BY day, dow
        )
        SELECT
            dow,
            ROUND(AVG(pct_consumed) * ? / 100.0, 1)                                    AS avg_liters
        FROM per_day
        GROUP BY dow
        ORDER BY dow
        """,
        (tz_mod, tz_mod, tank_vol_l),
    ).fetchall()

    daily_list   = [dict(r) for r in daily]
    hourly_list  = [dict(r) for r in hourly]
    dow_list     = [dict(r) for r in dow]

    total_7d     = sum(r["liters_consumed"] for r in daily_list)
    avg_daily    = round(total_7d / len(daily_list), 1) if daily_list else 0
    peak_day_row = max(daily_list, key=lambda r: r["liters_consumed"], default=None)
    peak_hr_row  = max(hourly_list, key=lambda r: r["avg_liters"], default=None)
    peak_dow_row = max(dow_list, key=lambda r: r["avg_liters"], default=None)

    return {
        "daily":       daily_list,
        "hourly":      hourly_list,
        "dow":         dow_list,
        "tank_vol_l":  round(tank_vol_l, 1),
        "totals": {
            "total_7d_l":  round(total_7d, 1),
            "avg_daily_l": avg_daily,
            "peak_date":   peak_day_row["day"] if peak_day_row else None,
            "peak_hour":   peak_hr_row["hour"] if peak_hr_row else None,
            "peak_dow":    peak_dow_row["dow"] if peak_dow_row else None,
        },
    }
