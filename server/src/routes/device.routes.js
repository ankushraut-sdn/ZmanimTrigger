import express from 'express';
import { registerDevice, getDeviceSchedule, receiveHeartbeat } from '../controllers/device.controller.js';

const router = express.Router();

router.post('/register', registerDevice);
router.get('/:deviceId/schedule', getDeviceSchedule);
router.post('/heartbeat', receiveHeartbeat);

export default router;
