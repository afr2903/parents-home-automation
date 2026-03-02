export default function TankVisual({ levelPct }) {
  const W = 90, H = 200, borderR = 6, pad = 3;
  const innerH = H - pad * 2;
  const waterH = Math.round((levelPct / 100) * innerH);
  const waterY = pad + (innerH - waterH);
  const color  = levelPct < 20 ? "#ef4444" : levelPct < 40 ? "#f97316" : "#3b82f6";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={`Tank ${levelPct.toFixed(0)}% full`}>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx={borderR}
        fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2.5" />
      {levelPct > 0 && (
        <rect
          x={2 + pad} y={waterY + 2}
          width={W - 4 - pad * 2} height={waterH - 2}
          rx={waterH > 10 ? borderR - 2 : 2}
          fill={color} opacity="0.88"
        />
      )}
      <text
        x={W / 2} y={H / 2 + 7} textAnchor="middle"
        fill={levelPct < 5 ? "#94a3b8" : "#fff"}
        fontSize="22" fontWeight="700"
        style={{ userSelect: "none" }}
      >
        {levelPct.toFixed(0)}%
      </text>
    </svg>
  );
}
