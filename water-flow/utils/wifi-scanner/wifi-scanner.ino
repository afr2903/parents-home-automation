#include <WiFi.h>

// ── Configuration ───────────────────────────────────────────────────
const int SCAN_INTERVAL = 30000;  // ms between scans

// ── Helpers ─────────────────────────────────────────────────────────
const char* encryptionLabel(wifi_auth_mode_t encType) {
  switch (encType) {
    case WIFI_AUTH_OPEN:            return "Open";
    case WIFI_AUTH_WEP:             return "WEP";
    case WIFI_AUTH_WPA_PSK:         return "WPA";
    case WIFI_AUTH_WPA2_PSK:        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:    return "WPA/WPA2";
    case WIFI_AUTH_WPA3_PSK:        return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:   return "WPA2/WPA3";
    default:                        return "Unknown";
  }
}

void runScan() {
  Serial.println("──────────────────────────────────────────");
  Serial.println("Scanning for Wi-Fi networks...");

  int found = WiFi.scanNetworks();

  if (found == 0) {
    Serial.println("No networks found.");
  } else {
    Serial.printf("Found %d network(s):\n\n", found);
    Serial.printf("  %-32s  %6s  %-5s  %s\n", "SSID", "RSSI", "Ch", "Security");
    Serial.println("  ────────────────────────────────────────────────────────");

    for (int i = 0; i < found; i++) {
      Serial.printf("  %-32s  %4d dBm  Ch%-2d  %s\n",
        WiFi.SSID(i).c_str(),
        WiFi.RSSI(i),
        WiFi.channel(i),
        encryptionLabel(WiFi.encryptionType(i))
      );
    }
  }

  WiFi.scanDelete();
  Serial.println();
  Serial.printf("Next scan in %d seconds.\n", SCAN_INTERVAL / 1000);
}

// ── Setup & Loop ─────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  Serial.println("\nESP32 Wi-Fi Scanner");
  runScan();
}

void loop() {
  static unsigned long lastScan = 0;

  if (millis() - lastScan >= SCAN_INTERVAL) {
    lastScan = millis();
    runScan();
  }
}
