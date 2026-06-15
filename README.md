# ZmanimTrigger IoT System

This project contains the complete IoT components for the **ZmanimTrigger** automated Shabbat/Holiday switch system. It features a standalone scheduling server and ESP32 microcontroller firmware to actuate physical relays in accordance with Halachic Zmanim candle-lighting and Havdalah times.

---

## Directory Structure

```
ZmanimTrigger/
├── README.md                 # System setup and hardware docs
├── server/                   # Node.js/Express IoT backend microservice
│   ├── package.json          # Node dependencies
│   ├── .env.example          # Server environment settings
│   ├── test_api.js           # Integration verification client
│   └── src/
│       ├── app.js            # Express app configuration
│       ├── server.js         # Service entry point (MongoDB & server start)
│       ├── config/           # Database and env vars
│       ├── models/           # Mongoose schemas (Device, Schedule)
│       ├── routes/           # REST endpoints
│       ├── controllers/      # Route controllers (register, schedule, heartbeat)
│       └── services/         # Zmanim & Hebcal scheduling service
└── firmware/                 # Microcontroller codebase
    ├── firmware.ino          # ESP32 Arduino Core sketch
    └── config.h              # Wifi, endpoints, and pin mappings configuration
```

---

## 1. IoT Backend Server Setup

The backend handles incoming device heartbeats, maintains hardware status records, queries geographic coordinates, fetches Shabbat times from Hebcal, and groups them into ON/OFF schedules.

### Prerequisites
- Node.js (v18+)
- MongoDB (running locally or in a container)

### Installation
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure settings:
   Copy `.env.example` to `.env` and configure your settings:
   ```bash
   cp .env.example .env
   ```
   - **`PORT`**: Port to run the server on (default: `5000`).
   - **`MONGO_URI`**: Connection string to MongoDB.
   - **`GEOAPIFY_KEY`**: Geocoding API key for timezone/coordinates lookup.

### Run the Server
- **Development mode** (with auto-reload):
  ```bash
  npm run dev
  ```
- **Production mode**:
  ```bash
  npm start
  ```

---

## 2. API Endpoints Specification

All communication between the edge controller and server is REST-based:

1. **`POST /api/devices/register`**
   - Microcontroller registers itself on startup using its physical MAC address.
   - **Payload**:
     ```json
     {
       "macAddress": "24:6F:28:1A:3B:5C",
       "deviceName": "Living Room Switch",
       "totalRelays": 4,
       "firmwareVersion": "1.0.0"
     }
     ```

2. **`GET /api/devices/:deviceId/schedule`**
   - Returns the weekly Shabbat schedule and device config settings.
   - **Response**:
     ```json
     {
       "deviceId": "651f47b2c019...",
       "serverTime": "2026-06-15T16:00:00.000Z",
       "timezoneOffset": -240,
       "config": {
         "syncIntervalMinutes": 360,
         "ntpServer": "pool.ntp.org"
       },
       "schedules": [
         {
           "gpio": 18,
           "name": "Relay 1 (Primary)",
           "intervals": [
             {
               "on": "2026-06-19T23:45:00.000Z",
               "off": "2026-06-20T23:55:00.000Z",
               "comment": "Candle lighting Shabbat Parashat Korach"
             }
           ]
         }
       ]
     }
     ```

3. **`POST /api/devices/heartbeat`**
   - Transmits periodic signal reporting hardware stats.
   - **Payload**:
     ```json
     {
       "deviceId": "651f47b2c019...",
       "status": "ONLINE",
       "rssi": -65,
       "heapFree": 178224,
       "activeRelays": [
         { "gpio": 18, "state": true }
       ]
     }
     ```

---

## 3. Microcontroller (ESP32) Firmware Setup

The firmware is written using the Arduino Core framework for ESP32.

### Prerequisites
- [Arduino IDE](https://www.arduino.cc/en/software) or VS Code with [PlatformIO](https://platformio.org/).
- ESP32 Board support packages installed.
- Arduino Libraries:
  - **`ArduinoJson`** (v7.x)

### Configuration
Open `firmware/config.h` and configure:
1. `WIFI_SSID` & `WIFI_PASSWORD` for your local network.
2. `BACKEND_API_BASE` pointing to your running backend server (e.g., `http://192.168.1.50:5000`).
3. Hardware pins mapping: Adjust `RELAY_PINS` and `BUTTON_PINS` arrays to match your physical wiring.

### Upload
1. Connect the ESP32 to your computer.
2. Select your ESP32 board and COM port in the Arduino IDE.
3. Open `firmware.ino` and upload.

---

## 4. Hardware Wiring Reference

Typical wiring representation for a 4-Channel active-high relay board:

```
    ESP32 Pinout                  Relay Board (Optocoupler input)
  +--------------+               +--------------------------------+
  |              |               |                                |
  |     3.3V     +-------------->|     VCC                        |
  |     GND      +-------------->|     GND                        |
  |              |               |                                |
  |   GPIO 18    +-------------->|     IN1 (Channel 1 Relay)      |
  |   GPIO 19    +-------------->|     IN2 (Channel 2 Relay)      |
  |   GPIO 22    +-------------->|     IN3 (Channel 3 Relay)      |
  |   GPIO 23    +-------------->|     IN4 (Channel 4 Relay)      |
  |              |               +--------------------------------+
  |              |
  |              |                Manual Push Buttons (active low)
  |   GPIO 12    +-------------->| [Button 1] --- GND             |
  |   GPIO 13    +-------------->| [Button 2] --- GND             |
  |   GPIO 14    +-------------->| [Button 3] --- GND             |
  |   GPIO 15    +-------------->| [Button 4] --- GND             |
  +--------------+
```

### Safety & Lockout Policies
1. **Shabbat Override Lockout**: During the calculated Shabbat and festival hours, the physical push buttons connected to `BUTTON_PINS` are programmatically disabled. This prevents manual override or accidental violations.
2. **Offline Resilience**: If the internet goes down, the ESP32 continues to read the weekly schedule cached in its internal non-volatile memory (LittleFS).
3. **NTP Integrity Check**: Correct scheduling relies on clock accuracy. If the device cannot sync time with NTP for more than 24 hours, it flags an error state and forces relays to off (safety mode) until a valid sync occurs.
4. **Dim Indicators**: The status LEDs are turned off or dimmed during Shabbat periods to keep light emission minimal.
