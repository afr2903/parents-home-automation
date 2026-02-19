import { useState, useEffect, useCallback, useRef } from "react";

export default function App() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [remaining, setRemaining] = useState(null); // seconds left, null = no timer
  const timerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pump/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch (err) {
      setError("Cannot reach server");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 2000);
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
    } catch (err) {
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

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const fmtRemaining = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatTime = (iso) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
  };

  const timeSince = (iso) => {
    if (!iso) return null;
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="container">
      <h1>Water Pump Control</h1>

      {error && <div className="error">{error}</div>}

      {status ? (
        <>
          <div className={`status-card ${status.pump_on ? "on" : "off"}`}>
            <div className="status-indicator" />
            <span className="status-label">
              Pump is {status.pump_on ? "ON" : "OFF"}
            </span>
          </div>

          <div className="controls">
            <button
              className="btn btn-on"
              onClick={() => sendOverride("on")}
              disabled={loading || status.pump_on}
            >
              Turn On
            </button>
            <button
              className="btn btn-off"
              onClick={() => sendOverride("off")}
              disabled={loading || !status.pump_on}
            >
              Turn Off
            </button>
          </div>

          <div className="timer-card">
            <h2>Timer</h2>
            {remaining !== null ? (
              <div className="timer-active">
                <span className="timer-display">{fmtRemaining(remaining)}</span>
                <button className="btn btn-off" onClick={cancelTimer}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="timer-setup">
                <div className="timer-inputs">
                  <label>
                    <select
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(Number(e.target.value))}
                    >
                      {Array.from({ length: 61 }, (_, i) => (
                        <option key={i} value={i}>{i}m</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <select
                      value={timerSeconds}
                      onChange={(e) => setTimerSeconds(Number(e.target.value))}
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((s) => (
                        <option key={s} value={s}>{s}s</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="btn btn-on"
                  onClick={startTimer}
                  disabled={loading || (timerMinutes === 0 && timerSeconds === 0)}
                >
                  Start Timer
                </button>
              </div>
            )}
          </div>

          <div className="info">
            <div className="info-row">
              <span className="info-label">Last change</span>
              <span>{formatTime(status.since)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Reason</span>
              <span>{status.reason}</span>
            </div>
            <div className="info-row">
              <span className="info-label">ESP32 last poll</span>
              <span className={status.last_esp_poll ? "connected" : "disconnected"}>
                {status.last_esp_poll ? timeSince(status.last_esp_poll) : "No contact"}
              </span>
            </div>
          </div>
        </>
      ) : (
        !error && <p>Loading...</p>
      )}
    </div>
  );
}
