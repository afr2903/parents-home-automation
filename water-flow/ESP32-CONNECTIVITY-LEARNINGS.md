# ESP32 HTTPS Connectivity: Lessons Learned

Hard-won knowledge from debugging ESP32 (Arduino) connectivity to cloud servers (Fly.io), applicable to any ESP32 + HTTPS project.

---

## 1. TLS Certificate Chain Verification Fails Silently

**Symptom**: `HTTP error: -1` (HTTPC_ERROR_CONNECTION_REFUSED) — no further detail.

**Root cause**: Fly.io (and many CDN/PaaS providers) serve **dual certificate stacks**: one ECDSA, one RSA. The server picks which chain to send based on the client's advertised cipher suites during the TLS handshake.

ESP32's mbedTLS advertises ECDSA-capable ciphers, so the server sends its ECDSA chain:

```
Leaf:         *.fly.dev          (ECDSA P-256)
Intermediate: E8 (Let's Encrypt) (ECDSA P-384)
Root:         ISRG Root X1       (RSA 4096)
```

This **mixed-algorithm chain** (ECDSA leaf/intermediate verified against an RSA root) causes mbedTLS to fail during verification. The RSA-only chain (through intermediate R12) would verify fine, but the ESP32 can't choose which chain to receive.

**Diagnosis**:
```bash
# Check what chain the server sends by default (usually ECDSA):
openssl s_client -connect host:443 -servername host -showcerts 2>&1 | grep -E '(s:|i:)'

# Force RSA cipher to see the RSA chain:
openssl s_client -connect host:443 -servername host -tls1_2 \
  -cipher 'ECDHE-RSA-AES128-GCM-SHA256' -showcerts 2>&1 | grep -E '(s:|i:)'
```

If these show different intermediates (e.g., E8 vs R12), your ESP32 is hitting the ECDSA chain and failing.

**Fix**: Use `client.setInsecure()` instead of `client.setCACert(rootCA)`. Traffic is still TLS-encrypted — only server certificate verification is skipped. For IoT devices sending sensor data with Bearer token authentication, this is an acceptable tradeoff. The API key provides application-layer authentication.

```cpp
WiFiClientSecure client;
client.setInsecure();  // TLS-encrypted, no cert verification
// NOT: client.setCACert(ROOT_CA);
```

**Alternative fix** (if cert verification is required): Use ESP32's built-in Mozilla CA bundle via `setCACertBundle()` which handles all chain types properly. This requires Arduino ESP32 core v2.0.5+.

---

## 2. ESP32 Has No RTC — TLS Fails Without NTP

**Symptom**: `HTTP error: -1` even with correct root CA certificates embedded.

**Root cause**: TLS certificate validation checks the cert's validity period (notBefore/notAfter). The ESP32 has no real-time clock — on boot, its clock starts at epoch (Jan 1, 1970). Every certificate appears "not yet valid" or the device's time is so wrong that validation fails.

**Fix**: Sync time via NTP before any HTTPS request:

```cpp
void syncNTP() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 20) {
    delay(500);
    attempts++;
  }
}

void setup() {
  // ...
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) syncNTP();
  // NOW safe to make HTTPS requests
}
```

**Key insight**: This must happen AFTER WiFi connects, BEFORE any HTTPS call. If NTP fails, all TLS connections with cert verification will fail.

---

## 3. `http.useHTTP10(true)` Fixes Chunked Transfer Issues

**Symptom**: HTTP request succeeds (status 200) but `http.getString()` returns empty or garbled data, or the connection hangs/times out during body read.

**Root cause**: Many servers (Flask/Gunicorn, Node.js, nginx) respond with HTTP/1.1 by default, which uses `Transfer-Encoding: chunked`. ESP32's HTTPClient has bugs in its chunked transfer decoding — it may hang waiting for chunk boundaries, misparse chunk sizes, or drop data.

**Fix**: Force HTTP/1.0 which guarantees `Content-Length` responses (no chunking):

```cpp
HTTPClient http;
http.begin(client, host, port, path, true);
http.useHTTP10(true);  // Force HTTP/1.0 — avoids chunked transfer bugs
```

**When to use**: Always, for ESP32. There is no downside — HTTP/1.0 works fine for simple request/response patterns. The only thing lost is connection keep-alive, which ESP32 doesn't benefit from anyway since it re-creates the WiFiClientSecure on each request.

---

## 4. Use Explicit `http.begin()` Form, Not URL Strings

**Symptom**: TLS connection fails or connects to the wrong host.

**Root cause**: The URL-string form `http.begin(client, "https://host/path")` has parsing issues in some Arduino ESP32 core versions. It may not correctly extract the host for SNI (Server Name Indication), causing the server to reject the connection or serve the wrong certificate.

**Fix**: Use the explicit host/port/path form:

```cpp
// GOOD — explicit and reliable:
http.begin(client, "host.example.com", 443, "/api/endpoint", true);

// AVOID — URL parsing can fail:
http.begin(client, "https://host.example.com/api/endpoint");
```

The `true` parameter at the end means HTTPS.

---

## 5. DNS Configuration Matters

**Symptom**: Intermittent connection failures, works sometimes, fails other times.

**Root cause**: The ESP32 uses the DNS server provided by DHCP (usually the home router). Home routers often have slow or unreliable DNS, especially for resolving CDN/Anycast hosts like `*.fly.dev`.

**Fix**: Configure fallback DNS before connecting to WiFi:

```cpp
IPAddress dns1(8, 8, 8, 8);      // Google DNS
IPAddress dns2(8, 8, 4, 4);      // Google DNS backup
WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, dns1, dns2);
WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
```

Note: `WiFi.config()` must be called BEFORE `WiFi.begin()`.

---

## 6. Non-Blocking Retry with Exponential Backoff

**Symptom**: ESP32 floods the server with retries after a failure, gets rate-limited, or blocks other operations (like safety checks) during retry delays.

**Fix**: Use non-blocking backoff with `millis()`:

```cpp
const int BACKOFF_STEPS[] = {2000, 5000, 10000};
const int MAX_BACKOFF     = 10000;
int retryCount = 0;
unsigned long nextAttemptTime = 0;

void loop() {
  unsigned long now = millis();

  // Safety checks run EVERY iteration, even during backoff
  checkSafetyTimeout(now);

  if (now < nextAttemptTime) return;  // Non-blocking wait

  if (pollCommand()) {
    retryCount = 0;
    nextAttemptTime = now + POLL_INTERVAL_MS;
  } else {
    int backoff = retryCount < 3 ? BACKOFF_STEPS[retryCount] : MAX_BACKOFF;
    retryCount++;
    nextAttemptTime = now + backoff;
  }
}
```

**Key insight**: Never use `delay()` for retry waits — it blocks the entire loop, preventing safety checks, watchdog feeds, and WiFi maintenance.

---

## 7. Safety-First Design for Actuators

When controlling physical actuators (pumps, valves, relays), always fail safe:

```cpp
// 1. Safety timeout — turn off if server unreachable
void checkSafetyTimeout(unsigned long now) {
  if (now - lastSuccess > SAFETY_TIMEOUT_MS) {
    if (pumpOn) {
      setPump(false);
      Serial.println("Safety timeout - pump OFF");
    }
  }
}

// 2. WiFi loss — turn off immediately
if (WiFi.status() != WL_CONNECTED) {
  setPump(false);  // Safe state FIRST
  connectWiFi();   // Then try to reconnect
}

// 3. Safety check runs EVERY loop iteration, not just when polling
void loop() {
  checkSafetyTimeout(millis());  // Always runs, even during backoff
  // ... rest of loop
}
```

---

## 8. Heap Monitoring

TLS on ESP32 uses significant RAM (~40-60KB for a single connection). Monitor free heap to catch memory leaks:

```cpp
bool heapPrinted = false;

// Print once after first TLS connection
if (!heapPrinted) {
  Serial.print("Free heap after TLS: ");
  Serial.println(ESP.getFreeHeap());
  heapPrinted = true;
}
```

Healthy free heap after TLS: >150KB. Below 100KB: risk of stack overflow or allocation failure on next connection.

---

## Quick Reference: Debugging Checklist

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| HTTP -1 after NTP sync | ECDSA cert chain | `setInsecure()` or `setCACertBundle()` |
| HTTP -1, time is 1970 | No NTP sync | Add `configTime()` + `syncNTP()` |
| HTTP 200 but empty body | Chunked transfer bug | `http.useHTTP10(true)` |
| HTTP -1 intermittent | DNS resolution failure | Set Google DNS before `WiFi.begin()` |
| HTTP -1, low heap | Not enough RAM for TLS | Check heap, reduce other allocations |
| Works with curl, not ESP32 | URL parsing / SNI issue | Use explicit `http.begin(client, host, port, path, true)` |
