#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// 1. Wi-Fi Configuration
// ==========================================
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ==========================================
// 2. Server API Configuration
// ==========================================
// Base URL of the ZmanimTrigger IoT Backend Server (without trailing slash)
#define BACKEND_API_BASE "http://YOUR_SERVER_IP:5000"

// Firmware metadata
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_FRIENDLY_NAME "ZmanimTrigger ESP32 Switch"

// ==========================================
// 3. Hardware Mappings (GPIO Pins)
// ==========================================
// Total relays connected
#define TOTAL_RELAYS 4

// Relays output GPIO pins
const int RELAY_PINS[TOTAL_RELAYS] = {18, 19, 22, 23};

// Physical manual override buttons GPIO pins
const int BUTTON_PINS[TOTAL_RELAYS] = {12, 13, 14, 15};

// Onboard LED indicators (Dimmed during Shabbat)
#define STATUS_LED_PIN 2 // ESP32 built-in LED (GPIO 2)

// ==========================================
// 4. Timing Configurations
// ==========================================
// How often to check the active schedule loop (in milliseconds)
#define SCHEDULE_CHECK_INTERVAL_MS 10000 // 10 seconds

// How often to send a heartbeat to the server (in milliseconds)
#define HEARTBEAT_INTERVAL_MS 60000 // 1 minute

// Local schedule cache file path in LittleFS
#define SCHEDULE_FILE_PATH "/schedule.json"

#endif // CONFIG_H
