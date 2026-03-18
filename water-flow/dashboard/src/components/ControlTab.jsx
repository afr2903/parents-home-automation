import { useState, useEffect, useCallback } from "react";

import TankVisual from "./TankVisual";
import { fmtRemaining, formatTime, modeLabel, reasonLabel, timeSince } from "../utils/format";
import { calcLiters, isSensorFresh } from "../utils/tank";
import { apiFetch } from "../utils/api";

export default function ControlTab({ tankConfig, onAuthError }) {
  const [status, setStatus]             = useState(null);
  const [error, setError]               = useState(null);
  const [loading, setLoading]           = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [, rerender]                    = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/pump/status");
      if (res.status === 401 || res.status === 403) { onAuthError(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch {
      setError("Cannot reach server");
    }
  }, [onAuthError]);

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
      const res = await apiFetch("/api/pump/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 401 || res.status === 403) { onAuthError(); return; }
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
      const res = await apiFetch("/api/pump/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: total }),
      });
      if (res.status === 401 || res.status === 403) { onAuthError(); return; }
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
      const res = await apiFetch("/api/pump/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: 0 }),
      });
      if (res.status === 401 || res.status === 403) { onAuthError(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch {
      setError("Failed to cancel timer");
    } finally {
      setLoading(false);
    }
  };

  const sensor    = status?.sensor ?? null;
  const levelPct  = sensor ? Math.round(sensor.level_pct) : null;
  const fresh     = isSensorFresh(sensor?.recorded_at);
  const isAuto    = status?.mode === "auto";
  const liters    = calcLiters(levelPct, tankConfig);
  const timerEnd  = status?.timer_end ? new Date(status.timer_end) : null;
  const remaining = timerEnd ? Math.max(0, Math.round((timerEnd - Date.now()) / 1000)) : null;

  if (!status && !error) return <p className="loading">Loading...</p>;

  return (
    <>
      {error && <div className="error">{error}</div>}

      {status && (
        <>
          <div className="card tank-section">
            <div className="tank-visual">
              <TankVisual levelPct={levelPct ?? 0} />
            </div>
            <div className="tank-stats">
              <div className="tank-level-big" style={{
                color: levelPct < 20 ? "#ef4444" : levelPct < 40 ? "#f97316" : "#1e40af",
              }}>
                {levelPct !== null ? `${levelPct}%` : "\u2014"}
              </div>
              {liters !== null && <div className="tank-liters">{liters} L</div>}
              <div className="tank-level-label">Water level</div>
              {sensor && <div className="tank-detail">{sensor.distance_cm.toFixed(1)} cm from sensor</div>}
              <div className="sensor-row">
                <span className={`dot ${fresh ? "online" : "offline"}`} />
                <span className="sensor-status">{fresh ? "Sensor online" : "Sensor offline"}</span>
              </div>
              {sensor && <div className="sensor-age">Last reading {timeSince(sensor.recorded_at + "Z")}</div>}
            </div>
          </div>

          <div className="card mode-section">
            <div className="mode-header">
              <span className="mode-label">Mode</span>
              <span className={`mode-badge ${isAuto ? "auto" : "manual"}`}>{modeLabel(status.mode)}</span>
            </div>
            <div className="mode-controls">
              <button className={`btn btn-auto ${isAuto ? "active" : ""}`} onClick={() => sendOverride("auto")} disabled={loading || isAuto}>Auto</button>
              <button className="btn btn-on"  onClick={() => sendOverride("on")}   disabled={loading || status.mode === "manual_on"}>Force ON</button>
              <button className="btn btn-off" onClick={() => sendOverride("off")}  disabled={loading || status.mode === "manual_off"}>Force OFF</button>
            </div>
            <div className="pump-badge">
              <span className={`dot ${status.pump_on ? "online" : "offline"}`} />
              <span className="pump-state">Pump is <strong>{status.pump_on ? "ON" : "OFF"}</strong></span>
              <span className="pump-reason">{reasonLabel(status.reason)}</span>
            </div>
          </div>

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
                  <select value={timerMinutes} onChange={(e) => setTimerMinutes(Number(e.target.value))}>
                    {Array.from({ length: 61 }, (_, i) => <option key={i} value={i}>{i}m</option>)}
                  </select>
                  <select value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))}>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((s) => (
                      <option key={s} value={s}>{s}s</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-on" onClick={startTimer} disabled={loading || (timerMinutes === 0 && timerSeconds === 0)}>Start</button>
              </div>
            )}
          </div>

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
      )}
    </>
  );
}
