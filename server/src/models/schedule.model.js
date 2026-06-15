import mongoose from 'mongoose';

const intervalSchema = new mongoose.Schema({
  on: { type: Date, required: true },
  off: { type: Date, required: true },
  comment: { type: String, default: '' }
}, { _id: false });

const pinScheduleSchema = new mongoose.Schema({
  gpio: { type: Number, required: true },
  name: { type: String, required: true },
  intervals: [intervalSchema]
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    unique: true
  },
  schedules: [pinScheduleSchema],
  syncIntervalMinutes: {
    type: Number,
    default: 360 // 6 hours
  },
  ntpServer: {
    type: String,
    default: 'pool.ntp.org'
  }
}, {
  timestamps: true
});

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;
