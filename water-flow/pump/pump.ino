#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── Configuration ───────────────────────────────────────────────────
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

// Update this to your server's local IP before flashing
const char* SERVER_IP   = "192.168.1.100";
const int   SERVER_PORT = 3001;

const int PUMP_PIN        = 13;
const int POLL_INTERVAL   = 5000;   // ms between API polls
const int SAFETY_TIMEOUT  = 60000;  // ms with no successful response → pump OFF

// ── State ───────────────────────────────────────────────────────────
bool pumpOn = false;
unsigned long lastPoll = 0;
unsigned long lastSuccess = 0;

// ── Helpers ─────────────────────────────────────────────────────────
void setPump(bool on) {
  pumpOn = on;
  digitalWrite(PUMP_PIN, on ? HIGH : LOW);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.disconnect(true);
  delay(100);

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected - IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());
    delay(500);
  } else {
    Serial.println();
    Serial.println("WiFi connection failed");
  }
}

// ── Setup ───────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PUMP_PIN, OUTPUT);
  setPump(false);

  WiFi.mode(WIFI_STA);
  connectWiFi();
  lastSuccess = millis();
}

// ── Loop ────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Reconnect WiFi if needed
  if (WiFi.status() != WL_CONNECTED) {
    setPump(false);
    Serial.println("WiFi lost - pump OFF (safety)");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      delay(POLL_INTERVAL);
      return;
    }
  }

  // Safety timeout: no successful response in SAFETY_TIMEOUT → pump OFF
  if (now - lastSuccess > SAFETY_TIMEOUT) {
    if (pumpOn) {
      setPump(false);
      Serial.println("Safety timeout - pump OFF");
    }
  }

  // Poll the server
  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;

    String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/pump/command";
    HTTPClient http;
    http.begin(url);
    http.setTimeout(5000);
    http.useHTTP10(true);

    int code = http.GET();

    if (code == 200) {
      String body = http.getString();
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, body);

      if (!err) {
        bool desired = doc["pump_on"] | false;
        lastSuccess = now;

        if (desired != pumpOn) {
          setPump(desired);
          Serial.print("Pump → ");
          Serial.println(desired ? "ON" : "OFF");
        }
      } else {
        Serial.print("JSON parse error: ");
        Serial.println(err.c_str());
      }
    } else {
      Serial.print("HTTP error: ");
      Serial.println(code);
    }

    http.end();
  }
}
