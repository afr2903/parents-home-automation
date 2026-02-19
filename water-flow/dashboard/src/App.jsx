import { useState, useEffect, useCallback } from "react";

export default function App() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
