import threading
from datetime import datetime, timezone

LOW_THRESHOLD       = 10          # % — pump turns ON below this
HIGH_THRESHOLD      = 90          # % — pump turns OFF above this
STALE_READING_MS    = 180_000      # ms before a sensor reading is considered stale (3 min for 60s post interval)
MAX_PUMP_RUNTIME_MS = 30 * 60_000 # ms hard cap on continuous pump runtime

lock = threading.Lock()

state: dict = {
    "pump_on":       False,
    "mode":          "auto",
    "reason":        "server_start",
    "since":         datetime.now(timezone.utc).isoformat(),
    "last_esp_poll": None,
    "timer_end":     None,
}
