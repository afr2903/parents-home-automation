import { useState, useEffect, useCallback } from "react";

// ── Helpers ───────────────────────────────────────────────────────────
// Returns today's date in the browser's local timezone as YYYY-MM-DD.
function todayLocal() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function timeSince(iso) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)    return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatTime(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function isSensorFresh(recordedAt) {
  if (!recordedAt) return false;
  const age = Date.now() - new Date(recordedAt + "Z").getTime();
  return age < 60000;
}

function modeLabel(mode) {
  if (mode === "auto")       return "Auto";
  if (mode === "manual_on")  return "Manual ON";
  if (mode === "manual_off") return "Manual OFF";
  return mode;
}

function reasonLabel(reason) {
  const map = {
    "server_start":          "System startup",
    "manual":                "Manual override",
    "auto:low_level":        "Auto — low water",
    "auto:high_level":       "Auto — tank full",
    "return_to_auto":        "Returned to auto",
    "safety:sensor_offline": "Safety — sensor offline",
    "safety:max_runtime":    "Safety — max runtime",
    "timer":                 "Manual timer",
    "timer_done":            "Timer finished",
    "timer_cancelled":       "Timer cancelled",
  };
  return map[reason] || reason;
}

// Returns litres as a formatted string, or null if config is unavailable.
function calcLiters(pct, tankConfig) {
  if (!tankConfig || pct === null) return null;
  const { TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM } = tankConfig;
  return (Math.PI * TANK_RADIUS_CM ** 2 * (pct / 100) * TANK_WATER_HEIGHT_CM / 1000).toFixed(0);
}

// ── Tank SVG visualization ────────────────────────────────────────────
function TankVisual({ levelPct }) {
  const W = 90;
  const H = 200;
  const borderR = 6;
  const pad = 3;
  const innerH = H - pad * 2;
  const waterH = Math.round((levelPct / 100) * innerH);
  const waterY = pad + (innerH - waterH);

  const waterColor =
    levelPct < 20 ? "#ef4444" :
    levelPct < 40 ? "#f97316" :
    "#3b82f6";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={`Tank ${levelPct.toFixed(0)}% full`}>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx={borderR}
        fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2.5" />
      {levelPct > 0 && (
        <rect
          x={2 + pad} y={waterY + 2}
          width={W - 4 - pad * 2} height={waterH - 2}
          rx={waterH > 10 ? borderR - 2 : 2}
          fill={waterColor}
          opacity="0.88"
        />
      )}
      <text
        x={W / 2} y={H / 2 + 7}
        textAnchor="middle"
        fill={levelPct < 5 ? "#94a3b8" : "#fff"}
        fontSize="22"
        fontWeight="700"
        style={{ userSelect: "none" }}
      >
        {levelPct.toFixed(0)}%
      </text>
    </svg>
  );
}

// ── SVG Line Chart ────────────────────────────────────────────────────
// data:         array of { [xKey]: number, level_pct: number }
// xKey:         "hour" (0-23) or "minute" (0-59)
// xMax:         23 or 59
// tankConfig:   { TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM } for litre tooltips
// onClickPoint: called with the x-value when a dot is clicked (day → hour zoom)
function LevelChart({ data, xKey, xMax, tankConfig, onClickPoint }) {
  const W = 380;
  const H = 160;
  const MT = 10, MR = 10, MB = 28, ML = 36;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;

  if (!data || data.length === 0) {
    return <div className="chart-empty">No data for this period</div>;
  }

  const toX = (val) => ML + (val / xMax) * plotW;
  const toY = (pct) => MT + (1 - pct / 100) * plotH;

  const linePoints = data.map((d) => `${toX(d[xKey])},${toY(d.level_pct)}`).join(" ");
  const areaPoints = [
    `${toX(data[0][xKey])},${toY(0)}`,
    ...data.map((d) => `${toX(d[xKey])},${toY(d.level_pct)}`),
    `${toX(data[data.length - 1][xKey])},${toY(0)}`,
  ].join(" ");

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = xKey === "hour" ? [0, 6, 12, 18, 23] : [0, 15, 30, 45, 59];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {/* Y grid lines + labels */}
      {yTicks.map((y) => (
        <g key={y}>
          <line
            x1={ML} y1={toY(y)} x2={ML + plotW} y2={toY(y)}
            stroke="#e2e8f0" strokeWidth="1"
          />
          <text x={ML - 4} y={toY(y) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
            {y}%
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="#3b82f6" opacity="0.1" />

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data dots with native SVG tooltip */}
      {data.map((d, i) => {
        const liters = calcLiters(d.level_pct, tankConfig);
        const tip = liters
          ? `${d.level_pct.toFixed(1)}% · ${liters} L`
          : `${d.level_pct.toFixed(1)}%`;
        return (
          <circle
            key={i}
            cx={toX(d[xKey])}
            cy={toY(d.level_pct)}
            r={onClickPoint ? 5 : 3}
            fill="#3b82f6"
            opacity="0.75"
            style={{ cursor: onClickPoint ? "pointer" : "default" }}
            onClick={() => onClickPoint?.(d[xKey])}
          >
            <title>{tip}</title>
          </circle>
        );
      })}

      {/* X axis baseline */}
      <line
        x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH}
        stroke="#cbd5e1" strokeWidth="1"
      />

      {/* X tick labels */}
      {xTicks.map((x) => (
        <text
          key={x}
          x={toX(x)}
          y={H - MB + 14}
          textAnchor="middle"
          fontSize="9"
          fill="#94a3b8"
        >
          {xKey === "hour"
            ? `${String(x).padStart(2, "0")}h`
            : `${String(x).padStart(2, "0")}m`}
        </text>
      ))}
    </svg>
  );
}

// ── Control tab ───────────────────────────────────────────────────────
function ControlTab({ tankConfig }) {
  const [status, setStatus]         = useState(null);
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [, rerender] = useState(0); // tick every second for smooth countdown display

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pump/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch {
      setError("Cannot reach server");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Re-render every second so the derived countdown display stays smooth.
  useEffect(() => {
    const id = setInterval(() => rerender((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sendOverride = async (action) => {
    setLoading(true);
    try {
      const res = await fetch("/api/pump/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch {
      setError("Failed to send command");
    } finally {
      setLoading(false);
    }
  };

  const startTimer = async () => {
    const total = timerMinutes * 60 + timerSeconds;
    if (total <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/pump/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: total }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch {
      setError("Failed to start timer");
    } finally {
      setLoading(false);
    }
  };

  const cancelTimer = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pump/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: 0 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch {
      setError("Failed to cancel timer");
    } finally {
      setLoading(false);
    }
  };

  const fmtRemaining = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const sensor    = status?.sensor ?? null;
  const levelPct  = sensor ? Math.round(sensor.level_pct) : null;
  const fresh     = isSensorFresh(sensor?.recorded_at);
  const isAuto    = status?.mode === "auto";
  const liters    = calcLiters(levelPct, tankConfig);

  // Derive remaining time from the server's timer_end — works across devices and reloads.
  const timerEnd  = status?.timer_end ? new Date(status.timer_end) : null;
  const remaining = timerEnd ? Math.max(0, Math.round((timerEnd - Date.now()) / 1000)) : null;

  return (
    <>
      {error && <div className="error">{error}</div>}

      {status ? (
        <>
          {/* ── Tank visual ──────────────────────────────────────── */}
          <div className="card tank-section">
            <div className="tank-visual">
              <TankVisual levelPct={levelPct ?? 0} />
            </div>
            <div className="tank-stats">
              <div className="tank-level-big" style={{
                color: levelPct < 20 ? "#ef4444" : levelPct < 40 ? "#f97316" : "#1e40af"
              }}>
                {levelPct !== null ? `${levelPct}%` : "—"}
              </div>
              {liters !== null && (
                <div className="tank-liters">{liters} L</div>
              )}
              <div className="tank-level-label">Water level</div>

              {sensor && (
                <div className="tank-detail">
                  {sensor.distance_cm.toFixed(1)} cm from sensor
                </div>
              )}

              <div className="sensor-row">
                <span className={`dot ${fresh ? "online" : "offline"}`} />
                <span className="sensor-status">
                  {fresh ? "Sensor online" : "Sensor offline"}
                </span>
              </div>

              {sensor && (
                <div className="sensor-age">
                  Last reading {timeSince(sensor.recorded_at + "Z")}
                </div>
              )}
            </div>
          </div>

          {/* ── Mode + pump control ──────────────────────────────── */}
          <div className="card mode-section">
            <div className="mode-header">
              <span className="mode-label">Mode</span>
              <span className={`mode-badge ${isAuto ? "auto" : "manual"}`}>
                {modeLabel(status.mode)}
              </span>
            </div>

            <div className="mode-controls">
              <button
                className={`btn btn-auto ${isAuto ? "active" : ""}`}
                onClick={() => sendOverride("auto")}
                disabled={loading || isAuto}
              >
                Auto
              </button>
              <button
                className="btn btn-on"
                onClick={() => sendOverride("on")}
                disabled={loading || (status.mode === "manual_on")}
              >
                Force ON
              </button>
              <button
                className="btn btn-off"
                onClick={() => sendOverride("off")}
                disabled={loading || (status.mode === "manual_off")}
              >
                Force OFF
              </button>
            </div>

            <div className="pump-badge">
              <span className={`dot ${status.pump_on ? "online" : "offline"}`} />
              <span className="pump-state">
                Pump is <strong>{status.pump_on ? "ON" : "OFF"}</strong>
              </span>
              <span className="pump-reason">{reasonLabel(status.reason)}</span>
            </div>
          </div>

          {/* ── Timer ───────────────────────────────────────────── */}
          <div className="card timer-card">
            <h2>Manual timer</h2>
            {remaining !== null ? (
              <div className="timer-active">
                <span className="timer-display">{fmtRemaining(remaining)}</span>
                <button className="btn btn-off" onClick={cancelTimer}>Cancel</button>
              </div>
            ) : (
              <div className="timer-setup">
                <div className="timer-inputs">
                  <select
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Number(e.target.value))}
                  >
                    {Array.from({ length: 61 }, (_, i) => (
                      <option key={i} value={i}>{i}m</option>
                    ))}
                  </select>
                  <select
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(Number(e.target.value))}
                  >
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((s) => (
                      <option key={s} value={s}>{s}s</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-on"
                  onClick={startTimer}
                  disabled={loading || (timerMinutes === 0 && timerSeconds === 0)}
                >
                  Start
                </button>
              </div>
            )}
          </div>

          {/* ── Info ────────────────────────────────────────────── */}
          <div className="card info">
            <div className="info-row">
              <span className="info-label">Last pump change</span>
              <span>{formatTime(status.since)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ESP32 pump last poll</span>
              <span className={status.last_esp_poll ? "connected" : "disconnected"}>
                {status.last_esp_poll ? timeSince(status.last_esp_poll) : "No contact"}
              </span>
            </div>
          </div>
        </>
      ) : (
        !error && <p className="loading">Loading…</p>
      )}
    </>
  );
}

// ── History tab ───────────────────────────────────────────────────────
function HistoryTab({ tankConfig }) {
  const [date, setDate]     = useState(todayLocal);
  const [hour, setHour]     = useState(null); // null = day view
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = hour !== null
      ? `/api/sensor/history?date=${date}&hour=${hour}`
      : `/api/sensor/history?date=${date}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body) => {
        setData(body.readings || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load history");
        setLoading(false);
      });
  }, [date, hour]);

  const navigate = (delta) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    setDate(d.toISOString().slice(0, 10));
    setHour(null);
  };

  const displayDate = new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  const stats = data.length > 0 ? {
    min: Math.min(...data.map((d) => d.level_pct)),
    max: Math.max(...data.map((d) => d.level_pct)),
    avg: data.reduce((s, d) => s + d.level_pct, 0) / data.length,
  } : null;

  const xKey = hour !== null ? "minute" : "hour";
  const xMax = hour !== null ? 59 : 23;

  return (
    <>
      {/* ── Navigation ───────────────────────────────────────────── */}
      {hour !== null ? (
        <div className="card history-nav">
          <button className="btn-nav" onClick={() => setHour(null)}>← Day</button>
          <span className="nav-title">
            {displayDate} · {String(hour).padStart(2, "0")}:00–{String(hour).padStart(2, "0")}:59
          </span>
        </div>
      ) : (
        <div className="card history-nav">
          <button className="btn-nav" onClick={() => navigate(-1)}>‹</button>
          <span className="nav-title">{displayDate}</span>
          <button className="btn-nav" onClick={() => navigate(1)} disabled={date >= todayLocal()}>›</button>
        </div>
      )}

      {/* ── Chart ────────────────────────────────────────────────── */}
      <div className="card history-chart-card">
        {loading ? (
          <p className="loading" style={{ padding: "24px 0" }}>Loading…</p>
        ) : error ? (
          <p className="error" style={{ margin: "12px 0" }}>{error}</p>
        ) : (
          <LevelChart
            data={data}
            xKey={xKey}
            xMax={xMax}
            tankConfig={tankConfig}
            onClickPoint={hour === null ? setHour : null}
          />
        )}
      </div>

      {/* ── Stats ────────────────────────────────────────────────── */}
      {stats && !loading && (
        <div className="card history-stats">
          <div className="stats-grid">
            {[
              { label: "Min", val: stats.min },
              { label: "Avg", val: stats.avg },
              { label: "Max", val: stats.max },
            ].map(({ label, val }) => {
              const liters = calcLiters(val, tankConfig);
              return (
                <div key={label} className="stat-item">
                  <span className="stat-label">{label}</span>
                  <span className="stat-pct">{val.toFixed(0)}%</span>
                  {liters && <span className="stat-liters">{liters} L</span>}
                </div>
              );
            })}
          </div>
          {hour === null && (
            <p className="chart-hint">Tap a point to zoom into that hour</p>
          )}
        </div>
      )}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("control");
  const [tankConfig, setTankConfig] = useState(null);

  useEffect(() => {
    fetch("/api/sensor/config")
      .then((r) => r.json())
      .then(setTankConfig)
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <h1>Water Automation</h1>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "control" ? "active" : ""}`}
          onClick={() => setActiveTab("control")}
        >
          Control
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      {activeTab === "control"
        ? <ControlTab tankConfig={tankConfig} />
        : <HistoryTab tankConfig={tankConfig} />}
    </div>
  );
}
