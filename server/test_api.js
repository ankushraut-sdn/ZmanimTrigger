import axios from 'axios';

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}/api/devices`;

async function runTests() {
  console.log('Starting ZmanimTrigger IoT API Integration Tests...\n');
  let deviceId = '';

  // Test 1: Register Device
  try {
    console.log('[1] Testing Device Registration [POST /api/devices/register]...');
    const registerPayload = {
      macAddress: '24:6F:28:1A:3B:5C',
      deviceName: 'Living Room Test Switch',
      totalRelays: 4,
      firmwareVersion: '1.0.0'
    };

    const response = await axios.post(`${BASE_URL}/register`, registerPayload);
    console.log('Registration success!');
    console.log(`Device ID in MongoDB: ${response.data._id}`);
    console.log(`Device Name: ${response.data.deviceName}`);
    console.log(`Status: ${response.data.status}`);
    deviceId = response.data._id;
  } catch (err) {
    console.error('Registration test failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 2: Fetch Schedule
  try {
    console.log('\n[2] Testing Schedule Generation & Fetch [GET /api/devices/:deviceId/schedule]...');
    console.log(`Querying schedule for Device: ${deviceId}`);
    const response = await axios.get(`${BASE_URL}/${deviceId}/schedule`);
    
    console.log('Schedule retrieval success!');
    console.log(`Server Time: ${response.data.serverTime}`);
    console.log(`Timezone Offset: ${response.data.timezoneOffset} minutes`);
    console.log(`NTP Server: ${response.data.config.ntpServer}`);
    console.log(`Relay Count: ${response.data.schedules.length}`);

    if (response.data.schedules.length > 0) {
      const firstRelay = response.data.schedules[0];
      console.log(`Sample Pin: GPIO ${firstRelay.gpio} (${firstRelay.name})`);
      console.log(`Intervals calculated: ${firstRelay.intervals.length}`);
      if (firstRelay.intervals.length > 0) {
        console.log(`  - Next On: ${firstRelay.intervals[0].on}`);
        console.log(`  - Next Off: ${firstRelay.intervals[0].off}`);
        console.log(`  - Event: ${firstRelay.intervals[0].comment}`);
      }
    }
  } catch (err) {
    console.error('Schedule test failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 3: Heartbeat Submission
  try {
    console.log('\n[3] Testing Device Heartbeat [POST /api/devices/heartbeat]...');
    const heartbeatPayload = {
      deviceId: deviceId,
      status: 'ONLINE',
      rssi: -55,
      heapFree: 182440,
      activeRelays: [
        { gpio: 18, state: true },
        { gpio: 19, state: false },
        { gpio: 22, state: true },
        { gpio: 23, state: false }
      ]
    };

    const response = await axios.post(`${BASE_URL}/heartbeat`, heartbeatPayload);
    console.log('Heartbeat success!');
    console.log('Response:', response.data);
  } catch (err) {
    console.error('Heartbeat test failed:', err.response?.data || err.message);
    process.exit(1);
  }

  console.log('\nAll IoT backend API endpoints verified successfully!');
}

runTests();
