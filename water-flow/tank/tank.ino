#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── Tank calibration ──────────────────────────────────────────────────
// Adjust these to match your physical tank measurements.
// The sensor sits on the lid pointing down at the water surface.
// A greater distance means less water.
const float EMPTY_DISTANCE_CM = 70.0;  // distance (cm) when tank is considered empty
const float FULL_DISTANCE_CM  = 20.0;  // distance (cm) when tank is considered full

// ── Hardware ──────────────────────────────────────────────────────────
const int TRIG_PIN = 13;
const int ECHO_PIN = 12;

// ── Network ───────────────────────────────────────────────────────────
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

// Update this to your server's local IP before flashing
const char* SERVER_IP   = "192.168.1.100";
const int   SERVER_PORT = 3001;

// ── Timing ────────────────────────────────────────────────────────────
const int READ_INTERVAL_MS = 10000;  // ms between sensor reads

unsigned long lastRead = 0;

// ── WiFi ──────────────────────────────────────────────────────────────
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
    Serial.println("WiFi connection failed, will retry");
  }
}

// ── Sensor ────────────────────────────────────────────────────────────
float readDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // 30 ms timeout covers the full range of the JSN-SR04T (~5m max)
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1.0;  // timeout: no echo received

  return duration * 0.034 / 2.0;
}

// Converts raw distance to a 0–100% water level.
// 0% = empty (distance at or beyond EMPTY_DISTANCE_CM)
// 100% = full (distance at or below FULL_DISTANCE_CM)
float distanceToLevel(float distance_cm) {
  float level = ((EMPTY_DISTANCE_CM - distance_cm) /
                 (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100.0;
  if (level < 0.0)   level = 0.0;
  if (level > 100.0) level = 100.0;
  return level;
}

// ── Setup ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  connectWiFi();
}

// ── Loop ──────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost - reconnecting...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      delay(READ_INTERVAL_MS);
      return;
    }
  }

  if (now - lastRead >= READ_INTERVAL_MS) {
    lastRead = now;

    float distance = readDistance();
    if (distance < 0) {
      Serial.println("Sensor timeout - skipping this reading");
      return;
    }

    float level = distanceToLevel(distance);

    Serial.print("Distance: ");
    Serial.print(distance, 1);
    Serial.print(" cm  |  Level: ");
    Serial.print(level, 1);
    Serial.println("%");

    // POST reading to API server
    String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/sensor/reading";
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    http.useHTTP10(true);

    JsonDocument doc;
    doc["distance_cm"] = distance;
    doc["level_pct"]   = level;
    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    if (code == 200) {
      Serial.println("Reading posted OK");
    } else {
      Serial.print("POST failed - HTTP ");
      Serial.println(code);
    }

    http.end();
  }
}
