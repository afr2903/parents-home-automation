import { calcLiters } from "../utils/tank";

const W = 380, H = 160, MT = 10, MR = 10, MB = 28, ML = 36;
const plotW = W - ML - MR;
const plotH = H - MT - MB;

const Y_TICKS = [0, 25, 50, 75, 100];
const X_TICKS = { hour: [0, 6, 12, 18, 23], minute: [0, 15, 30, 45, 59] };

export default function LevelChart({ data, xKey, xMax, tankConfig, onClickPoint }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">No data for this period</div>;
  }

  const toX = (val) => ML + (val / xMax) * plotW;
  const toY = (pct) => MT + (1 - pct / 100) * plotH;

  const linePts = data.map((d) => `${toX(d[xKey])},${toY(d.level_pct)}`).join(" ");
  const areaPts = [
    `${toX(data[0][xKey])},${toY(0)}`,
    ...data.map((d) => `${toX(d[xKey])},${toY(d.level_pct)}`),
    `${toX(data[data.length - 1][xKey])},${toY(0)}`,
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {Y_TICKS.map((y) => (
        <g key={y}>
          <line x1={ML} y1={toY(y)} x2={ML + plotW} y2={toY(y)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={ML - 4} y={toY(y) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{y}%</text>
        </g>
      ))}

      <polygon points={areaPts} fill="#3b82f6" opacity="0.1" />
      <polyline points={linePts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {data.map((d, i) => {
        const liters = calcLiters(d.level_pct, tankConfig);
        const tip    = liters ? `${d.level_pct.toFixed(1)}% · ${liters} L` : `${d.level_pct.toFixed(1)}%`;
        return (
          <circle
            key={i} cx={toX(d[xKey])} cy={toY(d.level_pct)}
            r={onClickPoint ? 5 : 3} fill="#3b82f6" opacity="0.75"
            style={{ cursor: onClickPoint ? "pointer" : "default" }}
            onClick={() => onClickPoint?.(d[xKey])}
          >
            <title>{tip}</title>
          </circle>
        );
      })}

      <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH} stroke="#cbd5e1" strokeWidth="1" />
      {X_TICKS[xKey].map((x) => (
        <text key={x} x={toX(x)} y={H - MB + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {xKey === "hour" ? `${String(x).padStart(2, "0")}h` : `${String(x).padStart(2, "0")}m`}
        </text>
      ))}
    </svg>
  );
}
