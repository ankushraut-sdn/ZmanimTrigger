import mongoose from 'mongoose';

const relayStateSchema = new mongoose.Schema({
  gpio: { type: Number, required: true },
  state: { type: Boolean, required: true }
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  macAddress: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  deviceName: {
    type: String,
    required: true,
    trim: true
  },
  totalRelays: {
    type: Number,
    required: true,
    min: 1
  },
  firmwareVersion: {
    type: String,
    default: '1.0.0'
  },
  locationRegion: {
    type: String,
    default: 'United States/New York'
  },
  status: {
    type: String,
    enum: ['ONLINE', 'STANDBY', 'ERROR'],
    default: 'STANDBY'
  },
  rssi: {
    type: Number,
    default: 0
  },
  heapFree: {
    type: Number,
    default: 0
  },
  activeRelays: [relayStateSchema],
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Device = mongoose.model('Device', deviceSchema);
export default Device;
