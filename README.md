# ZmanimTrigger

## 1. Project Overview

**Project Name:** ZmanimTrigger
**Version:** 1.0.0 (backend, from `server/package.json`)

### Description

ZmanimTrigger is an IoT system that automates Shabbat/Holiday light and appliance switching according to Halachic zmanim (candle-lighting and Havdalah times). It consists of a Node.js/Express backend that fetches zmanim from Hebcal and builds per-device ON/OFF schedules, and ESP32 firmware that polls the schedule, drives physical relays, and enforces Shabbat safety lockouts.

## 2. Core Features

- Automatic zmanim scheduling: fetches candle-lighting and Havdalah times from Hebcal based on device location and converts them into per-relay ON/OFF intervals.
- Device registration and heartbeat tracking: ESP32 devices register by MAC address and send periodic heartbeats reporting signal strength, free heap, and relay state.
- REST API for schedule distribution (`/api/devices/register`, `/api/devices/:deviceId/schedule`, `/api/devices/heartbeat`).
- Shabbat override lockout: physical push buttons are programmatically disabled during calculated Shabbat/festival hours to prevent manual override.
- Offline resilience: firmware caches the weekly schedule in non-volatile flash (LittleFS) and keeps operating if connectivity is lost.
- NTP integrity check: if the device cannot sync time for more than 24 hours, it forces all relays off (fail-safe) until a valid sync occurs.
- Dimmed status indicators during Shabbat periods to minimize light emission.

## 3. Tech Stack

| Component | Technology |
|---|---|
| Backend | Node.js, Express, MongoDB (Mongoose) |
| External APIs | Hebcal API (zmanim), Geoapify (geocoding) |
| Firmware | ESP32 (Arduino core), ArduinoJson, LittleFS |

## 4. Project Structure

```
ZmanimTrigger/
├── server/                 # Node.js/Express backend
│   ├── package.json
│   ├── .env.example
│   ├── test_api.js         # integration verification client
│   └── src/
│       ├── app.js          # Express app configuration
│       ├── server.js       # entry point (MongoDB + server start)
│       ├── config/         # DB and env config
│       ├── models/         # Mongoose schemas (Device, Schedule)
│       ├── routes/         # REST endpoints
│       ├── controllers/    # register, schedule, heartbeat handlers
│       └── services/       # Zmanim/Hebcal scheduling logic
└── firmware/
    ├── firmware.ino         # ESP32 Arduino sketch
    └── config.h             # WiFi, endpoint, and pin configuration
```

## 5. Prerequisites

- Node.js v18+
- MongoDB (local or containerized)
- Arduino IDE (or VS Code + PlatformIO) with ESP32 board support and the `ArduinoJson` v7.x library, for firmware builds
- A Geoapify API key

## 6. How to Run

### Backend server

```bash
cd server
npm install
cp .env.example .env
```

Configure `.env`:

- `PORT` — server port (default `5000`)
- `MONGO_URI` — MongoDB connection string
- `GEOAPIFY_KEY` — geocoding API key for timezone/coordinate lookup

Run:

```bash
npm run dev    # development, auto-reload
npm start      # production
```

### ESP32 firmware

1. Open `firmware/config.h` and set `WIFI_SSID`, `WIFI_PASSWORD`, and `BACKEND_API_BASE` (e.g. `http://192.168.1.50:5000`).
2. Adjust `RELAY_PINS` and `BUTTON_PINS` to match your wiring.
3. Connect the ESP32, select the board/COM port in the Arduino IDE, open `firmware.ino`, and upload.

Typical wiring: ESP32 GPIO 18/19/22/23 to relay channels 1-4 (active-high optocoupler inputs), GPIO 12/13/14/15 to manual push buttons (active low).

## 7. API Documentation

**`POST /api/devices/register`** — device self-registration on boot.
```json
{ "macAddress": "24:6F:28:1A:3B:5C", "deviceName": "Living Room Switch", "totalRelays": 4, "firmwareVersion": "1.0.0" }
```

**`GET /api/devices/:deviceId/schedule`** — weekly schedule and config.
```json
{
  "deviceId": "651f47b2c019...",
  "serverTime": "2026-06-15T16:00:00.000Z",
  "timezoneOffset": -240,
  "config": { "syncIntervalMinutes": 360, "ntpServer": "pool.ntp.org" },
  "schedules": [
    { "gpio": 18, "name": "Relay 1 (Primary)",
      "intervals": [{ "on": "2026-06-19T23:45:00.000Z", "off": "2026-06-20T23:55:00.000Z", "comment": "Candle lighting Shabbat Parashat Korach" }] }
  ]
}
```

**`POST /api/devices/heartbeat`** — periodic status report.
```json
{ "deviceId": "651f47b2c019...", "status": "ONLINE", "rssi": -65, "heapFree": 178224, "activeRelays": [{ "gpio": 18, "state": true }] }
```

## 8. Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default `5000`) |
| `MONGO_URI` | MongoDB connection string |
| `GEOAPIFY_KEY` | Geocoding API key for timezone/coordinate lookup |

## 9. Testing

`server/test_api.js` is a manual integration verification client (run against a live server), not an automated test suite — there is no `npm test` script.

## 10. Known Limitations

- No automated test suite; `test_api.js` requires a running server and database to exercise.
- Firmware safety lockout and fail-safe behavior depend on correct NTP sync; incorrect timezone/location configuration on the backend will produce incorrect schedules.

## 11. License

No `LICENSE` file is present in this repository.
