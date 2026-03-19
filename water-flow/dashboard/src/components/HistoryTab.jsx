import { useState, useEffect } from "react";

import LevelChart from "./LevelChart";
import { calcLiters, todayLocal } from "../utils/tank";
import { apiFetch } from "../utils/api";

export default function HistoryTab({ tankConfig, onAuthError }) {
  const [date, setDate]       = useState(todayLocal);
  const [hour, setHour]       = useState(null);
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = hour !== null
      ? `/api/sensor/history?date=${date}&hour=${hour}`
      : `/api/sensor/history?date=${date}`;
    apiFetch(url)
      .then((r) => {
        if (r.status === 401 || r.status === 403) { onAuthError(); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body) => { if (body) { setData(body.readings || []); setLoading(false); } })
      .catch(() => { setError("Failed to load history"); setLoading(false); });
  }, [date, hour, onAuthError]);

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
      {hour !== null ? (
        <div className="card history-nav">
          <button className="btn-nav" onClick={() => setHour(null)}>{"\u2190"} Day</button>
          <button className="btn-nav" onClick={() => setHour(hour - 1)} disabled={hour === 0}>{"\u2039"}</button>
          <span className="nav-title">
            {String(hour).padStart(2, "0")}:00{"\u2013"}{String(hour).padStart(2, "0")}:59
          </span>
          <button className="btn-nav" onClick={() => setHour(hour + 1)} disabled={hour === 23}>{"\u203a"}</button>
        </div>
      ) : (
        <div className="card history-nav">
          <button className="btn-nav" onClick={() => navigate(-1)}>{"\u2039"}</button>
          <span className="nav-title">{displayDate}</span>
          <button className="btn-nav" onClick={() => navigate(1)} disabled={date >= todayLocal()}>{"\u203a"}</button>
        </div>
      )}

      <div className="card history-chart-card">
        {loading ? (
          <p className="loading" style={{ padding: "24px 0" }}>Loading...</p>
        ) : error ? (
          <p className="error" style={{ margin: "12px 0" }}>{error}</p>
        ) : (
          <LevelChart
            data={data} xKey={xKey} xMax={xMax}
            tankConfig={tankConfig}
            onClickPoint={hour === null ? setHour : null}
          />
        )}
      </div>

      {stats && !loading && (
        <div className="card history-stats">
          <div className="stats-grid">
            {[{ label: "Min", val: stats.min }, { label: "Avg", val: stats.avg }, { label: "Max", val: stats.max }].map(({ label, val }) => {
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
          {hour === null && <p className="chart-hint">Tap a point to zoom into that hour</p>}
        </div>
      )}
    </>
  );
}
