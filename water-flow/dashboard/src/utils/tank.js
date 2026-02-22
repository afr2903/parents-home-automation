export function todayLocal() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function isSensorFresh(recordedAt) {
  if (!recordedAt) return false;
  return Date.now() - new Date(recordedAt + "Z").getTime() < 60_000;
}

export function calcLiters(pct, tankConfig) {
  if (!tankConfig || pct === null) return null;
  const { TANK_RADIUS_CM, TANK_WATER_HEIGHT_CM } = tankConfig;
  return (Math.PI * TANK_RADIUS_CM ** 2 * (pct / 100) * TANK_WATER_HEIGHT_CM / 1000).toFixed(0);
}
