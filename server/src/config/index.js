import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zmanimtrigger-iot',
  logLevel: process.env.LOG_LEVEL || 'info',
  geoapifyKey: process.env.GEOAPIFY_KEY || ''
};
