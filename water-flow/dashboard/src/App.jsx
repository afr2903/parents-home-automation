import { useState, useEffect, useCallback, useRef } from "react";

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
      {/* Tank body outline */}
      <rect x="2" y="2" width={W - 4} height={H - 4} rx={borderR}
        fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2.5" />

      {/* Water fill — grows from bottom */}
      {levelPct > 0 && (
        <rect
          x={2 + pad} y={waterY + 2}
          width={W - 4 - pad * 2} height={waterH - 2}
          rx={waterH > 10 ? borderR - 2 : 2}
          fill={waterColor}
          opacity="0.88"
        />
      )}

      {/* Level percentage centered in the tank */}
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

// ── Helpers ───────────────────────────────────────────────────────────
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
  };
  return map[reason] || reason;
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus]         = useState(null);
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [remaining, setRemaining]   = useState(null);
  const timerRef = useRef(null);

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
    await sendOverride("on");
    setRemaining(total);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          sendOverride("off");
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelTimer = async () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setRemaining(null);
    await sendOverride("off");
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const fmtRemaining = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Derived sensor values
  const sensor   = status?.sensor ?? null;
  const levelPct = sensor ? Math.round(sensor.level_pct) : null;
  const fresh    = isSensorFresh(sensor?.recorded_at);
  const isAuto   = status?.mode === "auto";

  return (
    <div className="container">
      <h1>Water Automation</h1>

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
    </div>
  );
}
