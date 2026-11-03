#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>

// Smart outlet prototype. Configure Wi-Fi and a per-device random token below.
// GPIO 26 is an example only: verify your relay board and ESP32 pinout.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* DEVICE_TOKEN = "REPLACE_WITH_A_LONG_RANDOM_DEVICE_TOKEN";
constexpr uint8_t RELAY_PIN = 26;
constexpr bool RELAY_ACTIVE_LOW = true;

WebServer server(80);
Preferences prefs;
bool outletOn = false;

void driveRelay() {
  digitalWrite(RELAY_PIN, (outletOn ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

bool authorized() {
  if (String(DEVICE_TOKEN) == "REPLACE_WITH_A_LONG_RANDOM_DEVICE_TOKEN" || strlen(DEVICE_TOKEN) < 24) {
    server.send(503, "application/json", "{\"error\":\"Set a random DEVICE_TOKEN in firmware first\"}");
    return false;
  }
  if (!server.hasHeader("X-Device-Token") || server.header("X-Device-Token") != DEVICE_TOKEN) {
    server.send(401, "application/json", "{\"error\":\"Unauthorized\"}");
    return false;
  }
  return true;
}

void sendState() {
  server.send(200, "application/json", String("{\"on\":") + (outletOn ? "true" : "false") + "}");
}

void handleState() {
  if (!authorized()) return;
  sendState();
}

void handleSet() {
  if (!authorized()) return;
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Expected JSON body\"}");
    return;
  }
  String body = server.arg("plain");
  body.trim();
  if (body != "{\"on\":true}" && body != "{\"on\":false}") {
    server.send(400, "application/json", "{\"error\":\"Body must be {\\\"on\\\":true} or {\\\"on\\\":false}\"}");
    return;
  }
  outletOn = body.indexOf("true") >= 0;
  driveRelay();
  prefs.putBool("on", outletOn);
  sendState();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  prefs.begin("outlet", false);
  // Safe boot default: relay remains off unless previously saved as on.
  outletOn = prefs.getBool("on", false);
  driveRelay();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.printf("\nDevice IP: http://%s\n", WiFi.localIP().toString().c_str());

  const char* headerKeys[] = {"X-Device-Token"};
  server.collectHeaders(headerKeys, 1);
  server.on("/health", HTTP_GET, []() {
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/state", HTTP_GET, handleState);
  server.on("/api/state", HTTP_OPTIONS, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Device-Token");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.send(204);
  });
  server.on("/api/state", HTTP_POST, handleSet);
  server.onNotFound([]() { server.send(404, "application/json", "{\"error\":\"Not found\"}"); });
  server.begin();
}

void loop() {
  server.handleClient();
}
