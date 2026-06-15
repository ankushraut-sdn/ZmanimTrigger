import Device from '../models/device.model.js';
import Schedule from '../models/schedule.model.js';
import { getOnOffPairs, getTimezoneOffsetMinutes } from '../services/zmanim.service.js';
import { format } from 'date-fns';

// Helper for default GPIO mapping based on relay count
const DEFAULT_GPIOS = [18, 19, 22, 23, 25, 26, 27, 32, 33];

/**
 * POST /api/devices/register
 * Payload: { macAddress, deviceName, totalRelays, firmwareVersion }
 */
export const registerDevice = async (req, res) => {
  try {
    const { macAddress, deviceName, totalRelays, firmwareVersion } = req.body;

    if (!macAddress || !deviceName || !totalRelays) {
      return res.status(400).json({ error: 'macAddress, deviceName, and totalRelays are required.' });
    }

    const formattedMac = macAddress.toUpperCase().trim();

    // Check if device already exists
    let device = await Device.findOne({ macAddress: formattedMac });

    if (device) {
      // Update existing device
      device.deviceName = deviceName;
      device.totalRelays = totalRelays;
      if (firmwareVersion) {
        device.firmwareVersion = firmwareVersion;
      }
      device.status = 'STANDBY';
      device.lastSeen = new Date();
      await device.save();
      console.log(`🔌 Existing device updated: ${formattedMac}`);
    } else {
      // Create new device
      device = new Device({
        macAddress: formattedMac,
        deviceName,
        totalRelays,
        firmwareVersion: firmwareVersion || '1.0.0',
        status: 'STANDBY',
        lastSeen: new Date()
      });
      await device.save();
      console.log(`🔌 New device registered: ${formattedMac}`);
    }

    return res.status(200).json(device);
  } catch (err) {
    console.error('Error registering device:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
};

/**
 * GET /api/devices/:deviceId/schedule
 * Calculates Shabbat and holiday schedule for the upcoming week and returns it.
 */
export const getDeviceSchedule = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await Device.findById(deviceId);

    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    // Determine time range: today to 7 days in the future
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const nextWeekStr = format(addDays(now, 7), 'yyyy-MM-dd');

    function addDays(date, days) {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    }

    console.log(`📅 Fetching Zmanim for ${device.deviceName} in region: ${device.locationRegion}`);
    const intervals = await getOnOffPairs(device.locationRegion, todayStr, nextWeekStr);

    // Build schedules array per relay pin
    const schedulesArray = [];
    const numRelays = Math.min(device.totalRelays, DEFAULT_GPIOS.length);
    for (let i = 0; i < numRelays; i++) {
      schedulesArray.push({
        gpio: DEFAULT_GPIOS[i],
        name: `Relay ${i + 1} (${i === 0 ? 'Primary' : 'Secondary'})`,
        intervals: intervals.map(interval => ({
          on: interval.on,
          off: interval.off,
          comment: interval.comment
        }))
      });
    }

    // Find or create the Schedule record
    let scheduleDoc = await Schedule.findOne({ deviceId: device._id });
    if (!scheduleDoc) {
      scheduleDoc = new Schedule({
        deviceId: device._id,
        schedules: schedulesArray,
        syncIntervalMinutes: 360,
        ntpServer: 'pool.ntp.org'
      });
    } else {
      scheduleDoc.schedules = schedulesArray;
    }
    await scheduleDoc.save();

    // Format output response as per specification
    const offsetMin = getTimezoneOffsetMinutes(device.locationRegion);

    const formattedSchedules = scheduleDoc.schedules.map(s => ({
      scheduleId: scheduleDoc._id.toString(),
      gpio: s.gpio,
      name: s.name,
      intervals: s.intervals.map(int => ({
        on: int.on.toISOString(),
        off: int.off.toISOString(),
        comment: int.comment
      }))
    }));

    const response = {
      deviceId: device._id.toString(),
      serverTime: new Date().toISOString(),
      timezoneOffset: offsetMin,
      config: {
        syncIntervalMinutes: scheduleDoc.syncIntervalMinutes,
        ntpServer: scheduleDoc.ntpServer
      },
      schedules: formattedSchedules
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error('Error generating schedule:', err);
    return res.status(500).json({ error: 'Internal server error calculating schedule.' });
  }
};

/**
 * POST /api/devices/heartbeat
 * Payload: { deviceId, status, rssi, heapFree, activeRelays }
 */
export const receiveHeartbeat = async (req, res) => {
  try {
    const { deviceId, status, rssi, heapFree, activeRelays } = req.body;

    if (!deviceId || !status) {
      return res.status(400).json({ error: 'deviceId and status are required.' });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    // Update status and report fields
    device.status = status;
    if (typeof rssi !== 'undefined') device.rssi = rssi;
    if (typeof heapFree !== 'undefined') device.heapFree = heapFree;
    if (activeRelays) device.activeRelays = activeRelays;
    device.lastSeen = new Date();

    await device.save();

    console.log(`💓 Heartbeat received for ${device.deviceName} (${status}, RSSI: ${rssi})`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error handling heartbeat:', err);
    return res.status(500).json({ error: 'Internal server error processing heartbeat.' });
  }
};
