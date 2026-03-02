export function timeSince(iso) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)    return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function formatTime(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export function fmtRemaining(s) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function modeLabel(mode) {
  const map = { auto: "Auto", manual_on: "Manual ON", manual_off: "Manual OFF" };
  return map[mode] ?? mode;
}

export function reasonLabel(reason) {
  const map = {
    server_start:            "System startup",
    manual:                  "Manual override",
    "auto:low_level":        "Auto — low water",
    "auto:high_level":       "Auto — tank full",
    return_to_auto:          "Returned to auto",
    "safety:sensor_offline": "Safety — sensor offline",
    "safety:max_runtime":    "Safety — max runtime",
    timer:                   "Manual timer",
    timer_done:              "Timer finished",
    timer_cancelled:         "Timer cancelled",
  };
  return map[reason] ?? reason;
}
