#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <LittleFS.h>
#include <time.h>
#include "config.h"

// ==========================================
// Global State Variables
// ==========================================
String deviceId = "";
String macAddress = "";
bool hasValidTime = false;
bool isOnShabbat = false;

// Last execution trackers
unsigned long lastHeartbeatTime = 0;
unsigned long lastScheduleSyncTime = 0;
unsigned long lastScheduleCheckTime = 0;

// Local relay overrides state (used when not on Shabbat)
bool localRelayStates[TOTAL_RELAYS] = {false};
bool lastButtonStates[TOTAL_RELAYS] = {HIGH}; // Pull-up active inputs

// ==========================================
// Time Helpers
// ==========================================
/**
 * Convert ISO 8601 string (UTC) to time_t epoch seconds.
 * Example format: "2026-06-15T16:00:00.000Z"
 */
time_t parseISO8601ToUTC(const char* isoStr) {
  if (!isoStr) return 0;
  struct tm t;
  int y, M, d, h, m, s;
  
  // Parse format "YYYY-MM-DDTHH:MM:SS"
  if (sscanf(isoStr, "%d-%d-%dT%d:%d:%d", &y, &M, &d, &h, &m, &s) >= 6) {
    t.tm_year = y - 1900;
    t.tm_mon = M - 1;
    t.tm_mday = d;
    t.tm_hour = h;
    t.tm_min = m;
    t.tm_sec = s;
    t.tm_isdst = 0;
    return timegm(&t); // Converts struct tm in UTC to epoch seconds
  }
  return 0;
}

/**
 * Get current UTC Epoch time.
 */
time_t getUTCEpoch() {
  time_t nowSecs;
  time(&nowSecs);
  return nowSecs;
}

// ==========================================
// File Cache Utilities (LittleFS)
// ==========================================
void saveScheduleToCache(const String& payload) {
  File file = LittleFS.open(SCHEDULE_FILE_PATH, "w");
  if (!file) {
    Serial.println("Failed to open schedule cache file for writing");
    return;
  }
  file.print(payload);
  file.close();
  Serial.println("Schedule written to local LittleFS cache.");
}

String readScheduleFromCache() {
  if (!LittleFS.exists(SCHEDULE_FILE_PATH)) {
    Serial.println("Schedule cache file does not exist.");
    return "";
  }
  File file = LittleFS.open(SCHEDULE_FILE_PATH, "r");
  if (!file) {
    Serial.println("Failed to open schedule cache file for reading.");
    return "";
  }
  String payload = file.readString();
  file.close();
  return payload;
}

// ==========================================
// API Client Functions
// ==========================================
/**
 * Register hardware MAC with backend server to obtain deviceId
 */
bool registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/api/devices/register";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Create registration payload
  JsonDocument doc;
  doc["macAddress"] = macAddress;
  doc["deviceName"] = DEVICE_FRIENDLY_NAME;
  doc["totalRelays"] = TOTAL_RELAYS;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  String requestJson;
  serializeJson(doc, requestJson);

  Serial.println("Registering device with backend...");
  int httpResponseCode = http.POST(requestJson);

  bool success = false;
  if (httpResponseCode == 200) {
    String responseJson = http.getString();
    JsonDocument respDoc;
    DeserializationError error = deserializeJson(respDoc, responseJson);

    if (!error && respDoc.containsKey("_id")) {
      deviceId = respDoc["_id"].as<String>();
      Serial.print("Registration successful! Device DB ID: ");
      Serial.println(deviceId);
      success = true;
    } else {
      Serial.println("Failed to parse registration response ID.");
    }
  } else {
    Serial.print("Registration failed. HTTP code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
  return success;
}

/**
 * Sync schedule from backend and cache locally
 */
bool fetchAndCacheSchedule() {
  if (deviceId.isEmpty() || WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/api/devices/" + deviceId + "/schedule";
  http.begin(url);

  Serial.println("Fetching schedule from server...");
  int httpResponseCode = http.GET();

  bool success = false;
  if (httpResponseCode == 200) {
    String payload = http.getString();
    
    // Save to cache early
    saveScheduleToCache(payload);

    // Parse configuration settings
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      long tzOffsetMin = doc["timezoneOffset"] | 0;
      const char* ntpServer = doc["config"]["ntpServer"] | "pool.ntp.org";

      // Configure time with GMT offset in seconds
      long tzOffsetSec = tzOffsetMin * 60;
      configTime(tzOffsetSec, 0, ntpServer);
      Serial.print("Time synchronized with offset: ");
      Serial.print(tzOffsetMin);
      Serial.print(" minutes via ");
      Serial.println(ntpServer);
      hasValidTime = true;
      success = true;
    }
  } else {
    Serial.print("Schedule fetch failed. HTTP code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
  return success;
}

/**
 * Report status and physical states to backend
 */
void sendHeartbeat() {
  if (deviceId.isEmpty() || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_API_BASE) + "/api/devices/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["status"] = isOnShabbat ? "ONLINE" : "STANDBY";
  doc["rssi"] = WiFi.RSSI();
  doc["heapFree"] = ESP.getFreeHeap();

  JsonArray relaysArray = doc["activeRelays"].to<JsonArray>();
  for (int i = 0; i < TOTAL_RELAYS; i++) {
    JsonObject relayObj = relaysArray.add<JsonObject>();
    relayObj["gpio"] = RELAY_PINS[i];
    relayObj["state"] = (digitalRead(RELAY_PINS[i]) == HIGH);
  }

  String requestJson;
  serializeJson(doc, requestJson);

  int httpResponseCode = http.POST(requestJson);
  if (httpResponseCode == 200) {
    Serial.println("Heartbeat successfully sent.");
  } else {
    Serial.print("Heartbeat failed. HTTP code: ");
    Serial.println(httpResponseCode);
  }
  http.end();
}

// ==========================================
// Core Scheduler Logic
// ==========================================
void evaluateSchedule() {
  // If we don't have synchronized clock, flash error state and default relays to off
  if (!hasValidTime) {
    Serial.println("No valid time sync available. Retaining safe state (OFF).");
    for (int i = 0; i < TOTAL_RELAYS; i++) {
      digitalWrite(RELAY_PINS[i], LOW);
    }
    return;
  }

  String cachedSchedule = readScheduleFromCache();
  if (cachedSchedule.isEmpty()) {
    Serial.println("No local schedule cache found. Relays configured to safe state (OFF).");
    for (int i = 0; i < TOTAL_RELAYS; i++) {
      digitalWrite(RELAY_PINS[i], LOW);
    }
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, cachedSchedule);
  if (error) {
    Serial.println("Failed to parse cached schedule JSON.");
    return;
  }

  time_t currentTime = getUTCEpoch();
  bool shabbatActiveAnyRelay = false;

  JsonArray schedules = doc["schedules"].as<JsonArray>();
  for (JsonVariant s : schedules) {
    int gpio = s["gpio"] | -1;
    
    // Find matching hardware relay channel index
    int relayIdx = -1;
    for (int i = 0; i < TOTAL_RELAYS; i++) {
      if (RELAY_PINS[i] == gpio) {
        relayIdx = i;
        break;
      }
    }

    if (relayIdx == -1) continue; // GPIO mapping not on this board

    bool relayShouldBeOn = false;
    bool shabbatActiveForRelay = false;
    JsonArray intervals = s["intervals"].as<JsonArray>();

    // Scan intervals for this relay
    for (JsonVariant interval : intervals) {
      const char* onStr = interval["on"];
      const char* offStr = interval["off"];

      time_t onTime = parseISO8601ToUTC(onStr);
      time_t offTime = parseISO8601ToUTC(offStr);

      if (onTime > 0 && offTime > 0) {
        if (currentTime >= onTime && currentTime < offTime) {
          relayShouldBeOn = true;
          shabbatActiveForRelay = true;
          shabbatActiveAnyRelay = true;
          break;
        }
      }
    }

    if (shabbatActiveForRelay) {
      // Shabbat active: Actuate strictly based on calculated schedule
      digitalWrite(RELAY_PINS[relayIdx], relayShouldBeOn ? HIGH : LOW);
    } else {
      // Weekday mode: Follow local button override settings
      digitalWrite(RELAY_PINS[relayIdx], localRelayStates[relayIdx] ? HIGH : LOW);
    }
  }

  isOnShabbat = shabbatActiveAnyRelay;

  // Indicator logic: Dim onboard LED on Shabbat/Holiday
  if (isOnShabbat) {
    digitalWrite(STATUS_LED_PIN, LOW); // Turn off indicators
  } else {
    digitalWrite(STATUS_LED_PIN, HIGH); // Onboard LED active (ready/weekday)
  }
}

/**
 * Reads physical input toggle buttons. Locked out during Shabbat schedules.
 */
void handleLocalButtons() {
  if (isOnShabbat) {
    // Shabbat lock: Buttons completely locked/disabled
    return;
  }

  // Weekday: Process button triggers to override relay state
  for (int i = 0; i < TOTAL_RELAYS; i++) {
    int buttonState = digitalRead(BUTTON_PINS[i]);
    if (buttonState == LOW && lastButtonStates[i] == HIGH) {
      // Button pressed (falling edge)
      localRelayStates[i] = !localRelayStates[i];
      Serial.print("Toggle relay ");
      Serial.print(i + 1);
      Serial.print(" locally to: ");
      Serial.println(localRelayStates[i] ? "ON" : "OFF");
      
      // Actuate immediately
      digitalWrite(RELAY_PINS[i], localRelayStates[i] ? HIGH : LOW);
      delay(50); // Simple debounce
    }
    lastButtonStates[i] = buttonState;
  }
}

// ==========================================
// Setup and Main Loop
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- ZmanimTrigger IoT Device Startup ---");

  // 1. Initialize GPIO Hardware
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW); // Start off

  for (int i = 0; i < TOTAL_RELAYS; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], LOW); // Set safe state (OFF)
    
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  }

  // 2. Mount file system
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed. Local cache will not function.");
  } else {
    Serial.println("LittleFS filesystem mounted.");
  }

  // 3. Connect to WiFi network
  macAddress = WiFi.macAddress();
  Serial.print("MAC Address: ");
  Serial.println(macAddress);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  int retryCount = 0;
  while (WiFi.status() != WL_CONNECTED && retryCount < 20) {
    delay(500);
    Serial.print(".");
    retryCount++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected to Wi-Fi! IP Address: ");
    Serial.println(WiFi.localIP());

    // 4. Register hardware with server
    if (registerDevice()) {
      // 5. Fetch initial schedule
      fetchAndCacheSchedule();
    }
  } else {
    Serial.println("Wi-Fi unavailable. Operating offline from local cache.");
    // Attempt time configuration from standard local pools as best effort
    configTime(0, 0, "pool.ntp.org");
    hasValidTime = true; // Attempt using RTC time if NTP sync succeeds
  }

  // Run initial scheduler check
  evaluateSchedule();
}

void loop() {
  unsigned long currentMillis = millis();

  // Handle manual push buttons (debounced & blocked during Shabbat)
  handleLocalButtons();

  // Evaluate scheduling logic (every 10 seconds)
  if (currentMillis - lastScheduleCheckTime >= SCHEDULE_CHECK_INTERVAL_MS) {
    lastScheduleCheckTime = currentMillis;
    evaluateSchedule();
  }

  // Sync schedule from API (every 6 hours)
  if (currentMillis - lastScheduleSyncTime >= (6 * 3600 * 1000)) {
    lastScheduleSyncTime = currentMillis;
    if (WiFi.status() == WL_CONNECTED) {
      fetchAndCacheSchedule();
    }
  }

  // Send status heartbeat (every 1 minute)
  if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = currentMillis;
    sendHeartbeat();
  }
}
