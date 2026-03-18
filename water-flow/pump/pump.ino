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

// Both ISRG Root X1 (RSA) and Root X2 (ECDSA) — Let's Encrypt uses either
// depending on the cert issued. mbedTLS (ESP32) accepts a concatenated PEM.
const char* ROOT_CA =
// ISRG Root X1 (RSA 4096, valid until 2035)
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6\n"
"UA5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+s\n"
"WT8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qy\n"
"HB5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4xKK4NbkS6OMhnVZ0l\n"
"LDbPPG6mONBv6n7thDJ/Cfyrn1UrQ+aQHFQ26gZtaE/v7FYIbBMFVmsCGBpLlE0G\n"
"f4MrcA2SsNERApVkOFAlQQCIcCGVHU6fBCJHdN0HOGhbGFkJHOlx8bREMuoDz5BU\n"
"3gSfTvxhGBHi3Ycx8jraCP/J/DBaUoSMjfT0+ANOJI3FMpxbFlkAzA+rhUMRrPMi\n"
"g0ytiMoYqH5l6fMQHlmliAOJ2guo6C54Dptvlz1goeNyINKjMOP5/W/TGaHnXCfR\n"
"8cXBPMpiRPbzBIJUftbWVMjJjCN5STExedT6QWqhhnV/0x8MfCkl9AaIFsDF4p0K\n"
"pLk9D63R52E57SUwLeErlnMRAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"nubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZG\n"
"Q3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/K\n"
"KNFtY2PwByVS5uCbMiogZiUwYfUL7p15cUfwR0EjFhXQ+7EWcBF68a/+1/1s/wHR\n"
"lFQuI7OR/CDEYF3QJAW5geJLGTCEkNRIiWMOWZ4iEl7s2BAjmmr/4BTXE+PDSBCq\n"
"7RVYz0H/tK5hpIIB2RiNZbhDsPC3FjMvhBFQzh9YAgrKpXEVN0VDabOdHgAIhuzD\n"
"rE3MhBnSrMDKNjFhFBIRLDTqmcG5cFdtGINYNilLP0mMIqKTOkSA83kvjhEH5DDT\n"
"OSp+9ih1E7IYzyRNJSoJgSD3PeRPaBRqGOQkBIIaQhv3JvFsLET9egNfXSi9bLSA\n"
"r5b0vjMZtSNQzeq8OQ5JCFFfe1OAS7RuFK+L/OU0zqcg+MNvQ7hkcsFEnM3E/9RB\n"
"LjVT/SIkAoqMcnLmW0PNR3SQgfvEHn/eTRLQm5rQRKP93guvnOVNPSdtyTCaS1m\n"
"6IvCF8DV8laLT89tVmFKW+wBMDkfrSsmU7FPISCYvBEiPh0Y/UcyB/uyGnYa5g8=\n"
"-----END CERTIFICATE-----\n"
// ISRG Root X2 (ECDSA P-384, valid until 2040)
"-----BEGIN CERTIFICATE-----\n"
"MIICGzCCAaGgAwIBAgIQZDbMLB/9iFCRBzKLGnAsFDAKBggqhkjOPQQDAzBPMQsw\n"
"CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg\n"
"R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00\n"
"MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT\n"
"ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw\n"
"EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW\n"
"+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7ZAkEmlL0O\n"
"P2FC5Nns6JR+YFAN5jUA3CnWhYo0o2YwZDAOBgNVHQ8BAf8EBAMCAQYwEgYDVR0T\n"
"AQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwHwYD\n"
"VR0jBBgwFoAUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZIzj0EAwMDaAAwZQIh\n"
"ALkW8jFdJXcJnTlDBl1P1Kv1nwZPMVH5hGSAeR0SV/R5AiAWWRBPgZ6SZRK2lV6\n"
"+RJVnjOVoTfJFNNHePQxSl2iyg==\n"
"-----END CERTIFICATE-----\n";

// ── Timing ────────────────────────────────────────────────────────────
const unsigned long POLL_INTERVAL_MS  = 30000;   // 30s between polls
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
  client.setCACert(ROOT_CA);

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
