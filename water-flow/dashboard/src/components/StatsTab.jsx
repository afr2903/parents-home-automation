import { useState, useEffect } from "react";
import { apiFetch } from "../utils/api";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// -- Mini SVG bar chart -------------------------------------------------------
function BarChart({ data, xLabel, yMax, color = "#3b82f6", barCount = null, emptyMsg = "No data yet" }) {
  const W = 360, H = 100, MB = 20, ML = 0, MT = 6;
  const plotW = W - ML;
  const plotH = H - MB - MT;

  if (!data || data.length === 0) {
    return <div className="chart-empty">{emptyMsg}</div>;
  }

  const max = yMax ?? Math.max(...data.map((d) => d.value), 0.001);
  const count = barCount ?? data.length;
  const gap = 3;
  const barW = (plotW - gap * (count - 1)) / count;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {data.map((d, i) => {
        const bh  = Math.max(2, (d.value / max) * plotH);
        const x   = ML + i * (barW + gap);
        const y   = MT + plotH - bh;
        const tip = `${d.label}: ${d.value.toFixed(1)} L`;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx="2" fill={color} opacity="0.85">
              <title>{tip}</title>
            </rect>
            <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// -- Uptime ring --------------------------------------------------------------
function UptimeRing({ pct, status }) {
  const R = 32, CX = 40, CY = 40, SW = 7;
  const circ = 2 * Math.PI * R;
  const fill  = (pct / 100) * circ;
  const color = pct >= 99 ? "#22c55e" : pct >= 95 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={SW} />
      <circle
        cx={CX} cy={CY} r={R} fill="none"
        stroke={color} strokeWidth={SW}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${CX} ${CY})`}
      />
      <text x={CX} y={CY - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">
        {pct.toFixed(0)}%
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize="7.5" fill="#94a3b8">uptime</text>
      <circle cx={CX} cy={CY + 22} r={4} fill={status === "online" ? "#22c55e" : "#cbd5e1"}
        style={status === "online" ? { filter: "drop-shadow(0 0 3px rgba(34,197,94,.6))" } : {}} />
    </svg>
  );
}

function fmtDowntime(s) {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function shortDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// -- Main component -----------------------------------------------------------
export default function StatsTab({ onAuthError }) {
  const [water,  setWater]  = useState(null);
  const [uptime, setUptime] = useState(null);
  const [wErr,   setWErr]   = useState(null);
  const [uErr,   setUErr]   = useState(null);

  useEffect(() => {
    apiFetch("/api/stats/water")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { onAuthError(); return; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => { if (data) setWater(data); })
      .catch(() => setWErr("Failed to load water stats"));

    apiFetch("/api/stats/uptime")
      .then((r) => {
        if (r.status === 401 || r.status === 403) { onAuthError(); return; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => { if (data) setUptime(data); })
      .catch(() => setUErr("Failed to load uptime stats"));
  }, [onAuthError]);

  // -- Water usage charts --
  const dailyBars = water?.daily.map((r) => ({
    label: shortDate(r.day),
    value: r.liters_consumed,
  })) ?? [];

  const hourlyBars = water?.hourly.map((r) => ({
    label: r.hour % 6 === 0 ? `${String(r.hour).padStart(2, "0")}h` : "",
    value: r.avg_liters,
  })) ?? [];

  const dowBars = water?.dow.map((r) => ({
    label: DOW_NAMES[r.dow],
    value: r.avg_liters,
  })) ?? [];

  const peakHour = water?.totals.peak_hour;
  const peakDow  = water?.totals.peak_dow;
  const peakDate = water?.totals.peak_date;

  return (
    <>
      {/* -- Water Usage --------------------------------------------------- */}
      <div className="stats-section-header">Water Usage</div>

      {wErr ? (
        <div className="error">{wErr}</div>
      ) : !water ? (
        <p className="loading" style={{ padding: "24px 0" }}>Loading...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="card stats-kpi-row">
            <div className="stats-kpi">
              <span className="stats-kpi-val">{water.totals.total_7d_l} L</span>
              <span className="stats-kpi-label">Total (7 days)</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-val">{water.totals.avg_daily_l} L</span>
              <span className="stats-kpi-label">Daily avg</span>
            </div>
            <div className="stats-kpi">
              <span className="stats-kpi-val">{water.tank_vol_l} L</span>
              <span className="stats-kpi-label">Tank capacity</span>
            </div>
          </div>

          {/* Peak insights */}
          {(peakHour !== null || peakDow !== null) && (
            <div className="card stats-insights">
              {peakDate && (
                <div className="insight-row">
                  <span className="insight-icon">{"\ud83d\udcc5"}</span>
                  <span>Peak day this week: <strong>{shortDate(peakDate)}</strong></span>
                </div>
              )}
              {peakDow !== null && (
                <div className="insight-row">
                  <span className="insight-icon">{"\ud83d\udcc6"}</span>
                  <span>Busiest day of week: <strong>{DOW_FULL[peakDow]}</strong></span>
                </div>
              )}
              {peakHour !== null && (
                <div className="insight-row">
                  <span className="insight-icon">{"\ud83d\udd50"}</span>
                  <span>Peak hour: <strong>{String(peakHour).padStart(2, "0")}:00\u2013{String(peakHour).padStart(2, "0")}:59</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Daily bar chart */}
          <div className="card stats-chart-card">
            <div className="stats-chart-title">Daily consumption \u2014 last 7 days</div>
            <BarChart data={dailyBars} color="#3b82f6" emptyMsg="No readings in the past 7 days" />
          </div>

          {/* Hourly pattern */}
          <div className="card stats-chart-card">
            <div className="stats-chart-title">Hourly pattern (avg L consumed)</div>
            <BarChart data={hourlyBars} barCount={24} color="#6366f1" emptyMsg="Not enough data yet" />
          </div>

          {/* Day-of-week pattern */}
          {dowBars.length > 0 && (
            <div className="card stats-chart-card">
              <div className="stats-chart-title">Day-of-week pattern (avg L)</div>
              <BarChart data={dowBars} color="#10b981" emptyMsg="Not enough data yet" />
            </div>
          )}
        </>
      )}

      {/* -- Uptime -------------------------------------------------------- */}
      <div className="stats-section-header" style={{ marginTop: 8 }}>System Uptime</div>

      {uErr ? (
        <div className="error">{uErr}</div>
      ) : !uptime ? (
        <p className="loading" style={{ padding: "24px 0" }}>Loading...</p>
      ) : (
        <>
          {[
            { key: "sensor", label: "Tank Sensor", desc: "ESP32 ultrasonic sensor" },
            { key: "pump",   label: "Pump Controller", desc: "ESP32 pump relay" },
          ].map(({ key, label, desc }) => {
            const u24 = uptime[key]["24h"];
            const u7d = uptime[key]["7d"];
            return (
              <div key={key} className="card uptime-card">
                <div className="uptime-ring-col">
                  <UptimeRing pct={u7d.uptime_pct} status={u24.current_status} />
                  <span className="uptime-circuit-label">{label}</span>
                  <span className="uptime-circuit-desc">{desc}</span>
                </div>
                <div className="uptime-details">
                  <div className="uptime-row">
                    <span className="uptime-row-label">Status</span>
                    <span className={u24.current_status === "online" ? "connected" : "disconnected"}>
                      {u24.current_status === "online" ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="uptime-row">
                    <span className="uptime-row-label">Last 24 h</span>
                    <span>{u24.uptime_pct}%</span>
                  </div>
                  <div className="uptime-row">
                    <span className="uptime-row-label">Last 7 days</span>
                    <span>{u7d.uptime_pct}%</span>
                  </div>
                  <div className="uptime-row">
                    <span className="uptime-row-label">Downtime (7d)</span>
                    <span>{fmtDowntime(u7d.downtime_s)}</span>
                  </div>
                  <div className="uptime-row">
                    <span className="uptime-row-label">Outages (7d)</span>
                    <span>{u7d.downtime_events}</span>
                  </div>
                </div>
              </div>
            );
          })}

          <p className="chart-hint" style={{ textAlign: "center", marginTop: -8 }}>
            Device considered offline after 2 min without contact
          </p>
        </>
      )}
    </>
  );
}
