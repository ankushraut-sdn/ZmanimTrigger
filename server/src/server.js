import app from './app.js';
import config from './config/index.js';
import connectDB from './config/db.js';

const start = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Start listening
    app.listen(config.port, () => {
      console.log(`ZmanimTrigger IoT Backend Server listening on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to boot ZmanimTrigger IoT Server:', err);
    process.exit(1);
  }
};

start();
