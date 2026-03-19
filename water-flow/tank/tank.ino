#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD, API_KEY

// ── Tank calibration ──────────────────────────────────────────────────
const float EMPTY_DISTANCE_CM = 70.0;
const float FULL_DISTANCE_CM  = 20.0;

// ── Hardware ──────────────────────────────────────────────────────────
const int TRIG_PIN = 13;
const int ECHO_PIN = 12;

// ── Network ───────────────────────────────────────────────────────────
const char* SERVER_HOST = "southern-granaries-120-server.fly.dev";
const char* SERVER_PATH = "/api/sensor/reading";
const int   SERVER_PORT = 443;

// Fly.io serves an ECDSA cert chain (intermediate E8, P-384) by default.
// ESP32's mbedTLS struggles with this mixed ECDSA/RSA chain verification.
// setInsecure() skips cert verification but traffic is still TLS-encrypted.
// The Bearer API key provides authentication at the application layer.

// ── Timing ────────────────────────────────────────────────────────────
const unsigned long READ_INTERVAL_MS = 30000;   // 60s between reads
const int HTTP_TIMEOUT_MS            = 10000;   // 10s for TLS handshake

// ── Retry backoff ─────────────────────────────────────────────────────
const int BACKOFF_STEPS[] = {2000, 5000, 10000};
const int MAX_BACKOFF     = 10000;

int retryCount                = 0;
unsigned long nextAttemptTime = 0;
bool heapPrinted              = false;

// ── NTP time sync ─────────────────────────────────────────────────────
void syncNTP() {
  Serial.print("Syncing time via NTP");
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (getLocalTime(&timeinfo)) {
    Serial.println();
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S UTC", &timeinfo);
    Serial.print("Time synced: ");
    Serial.println(buf);
  } else {
    Serial.println();
    Serial.println("NTP sync failed — TLS may fail");
  }
}

// ── WiFi ──────────────────────────────────────────────────────────────
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.disconnect(true);
  delay(100);

  // Configure fallback DNS before connecting
  IPAddress dns1(8, 8, 8, 8);
  IPAddress dns2(8, 8, 4, 4);
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, dns1, dns2);

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

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1.0;

  return duration * 0.034 / 2.0;
}

float distanceToLevel(float distance_cm) {
  float level = ((EMPTY_DISTANCE_CM - distance_cm) /
                 (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100.0;
  if (level < 0.0)   level = 0.0;
  if (level > 100.0) level = 100.0;
  return level;
}

// ── HTTP POST ─────────────────────────────────────────────────────────
bool postReading(float distance, float level) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, SERVER_HOST, SERVER_PORT, SERVER_PATH, true);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_KEY);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.useHTTP10(true);

  JsonDocument doc;
  doc["distance_cm"] = distance;
  doc["level_pct"]   = level;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  if (!heapPrinted) {
    Serial.print("Free heap after TLS: ");
    Serial.println(ESP.getFreeHeap());
    heapPrinted = true;
  }

  if (code == 200) {
    Serial.println("Reading posted OK");
    return true;
  } else {
    Serial.print("POST failed - HTTP ");
    Serial.println(code);
    return false;
  }
}

// ── Setup ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) syncNTP();
}

// ── Loop ──────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi lost - reconnecting...");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  if (now < nextAttemptTime) return;

  float distance = readDistance();
  if (distance < 0) {
    Serial.println("Sensor timeout - skipping this reading");
    nextAttemptTime = now + READ_INTERVAL_MS;
    return;
  }

  float level = distanceToLevel(distance);

  Serial.print("Distance: ");
  Serial.print(distance, 1);
  Serial.print(" cm  |  Level: ");
  Serial.print(level, 1);
  Serial.println("%");

  if (postReading(distance, level)) {
    retryCount = 0;
    nextAttemptTime = now + READ_INTERVAL_MS;
  } else {
    int backoff = retryCount < 3 ? BACKOFF_STEPS[retryCount] : MAX_BACKOFF;
    retryCount++;
    nextAttemptTime = now + backoff;
    Serial.print("Retry in ");
    Serial.print(backoff);
    Serial.println(" ms");
  }
}
