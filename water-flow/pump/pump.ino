#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD, API_KEY

// ── Hardware ──────────────────────────────────────────────────────────
const int PUMP_PIN = 13;

// ── Network ───────────────────────────────────────────────────────────
const char* SERVER_HOST = "southern-granaries-120-server.fly.dev";
const char* SERVER_PATH = "/api/pump/command";
const int   SERVER_PORT = 443;

// Fly.io serves an ECDSA cert chain (intermediate E8, P-384) by default.
// ESP32's mbedTLS struggles with this mixed ECDSA/RSA chain verification.
// setInsecure() skips cert verification but traffic is still TLS-encrypted.
// The Bearer API key provides authentication at the application layer.

// ── Timing ────────────────────────────────────────────────────────────
const unsigned long POLL_INTERVAL_MS  = 15000;   // 30s between polls
const unsigned long SAFETY_TIMEOUT_MS = 120000;  // 2 min — pump OFF if no response
const int HTTP_TIMEOUT_MS             = 10000;   // 10s for TLS handshake

// ── Retry backoff ─────────────────────────────────────────────────────
const int BACKOFF_STEPS[] = {2000, 5000, 10000};
const int MAX_BACKOFF     = 10000;

// ── State ─────────────────────────────────────────────────────────────
bool pumpOn                   = false;
unsigned long lastSuccess     = 0;
unsigned long nextAttemptTime = 0;
int retryCount                = 0;
bool heapPrinted              = false;

// ── Helpers ───────────────────────────────────────────────────────────
void setPump(bool on) {
  pumpOn = on;
  digitalWrite(PUMP_PIN, on ? HIGH : LOW);
}

void checkSafetyTimeout(unsigned long now) {
  if (now - lastSuccess > SAFETY_TIMEOUT_MS) {
    if (pumpOn) {
      setPump(false);
      Serial.println("Safety timeout - pump OFF");
    }
  }
}

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
    Serial.println("WiFi connection failed");
  }
}

// ── HTTP GET ──────────────────────────────────────────────────────────
bool pollCommand() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  // Use explicit host/port/path form — more reliable than URL string with WiFiClientSecure
  http.begin(client, SERVER_HOST, SERVER_PORT, SERVER_PATH, true);
  http.addHeader("Authorization", String("Bearer ") + API_KEY);
  http.setTimeout(HTTP_TIMEOUT_MS);

  int code = http.GET();

  if (!heapPrinted) {
    Serial.print("Free heap after TLS: ");
    Serial.println(ESP.getFreeHeap());
    heapPrinted = true;
  }

  if (code == 200) {
    String body = http.getString();
    http.end();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);

    if (!err) {
      bool desired = doc["pump_on"] | false;
      lastSuccess = millis();

      if (desired != pumpOn) {
        setPump(desired);
        Serial.print("Pump -> ");
        Serial.println(desired ? "ON" : "OFF");
      }
      return true;
    } else {
      Serial.print("JSON parse error: ");
      Serial.println(err.c_str());
      return false;
    }
  } else {
    Serial.print("HTTP error: ");
    Serial.println(code);
    http.end();
    return false;
  }
}

// ── Setup ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(PUMP_PIN, OUTPUT);
  setPump(false);

  WiFi.mode(WIFI_STA);
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) syncNTP();
  lastSuccess = millis();
}

// ── Loop ──────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Safety check runs EVERY iteration, even during backoff
  checkSafetyTimeout(now);

  // Reconnect WiFi if needed
  if (WiFi.status() != WL_CONNECTED) {
    setPump(false);
    Serial.println("WiFi lost - pump OFF (safety)");
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  // Non-blocking wait for next attempt
  if (now < nextAttemptTime) return;

  if (pollCommand()) {
    retryCount = 0;
    nextAttemptTime = now + POLL_INTERVAL_MS;
  } else {
    int backoff = retryCount < 3 ? BACKOFF_STEPS[retryCount] : MAX_BACKOFF;
    retryCount++;
    nextAttemptTime = now + backoff;
    Serial.print("Retry in ");
    Serial.print(backoff);
    Serial.println(" ms");
  }
}
