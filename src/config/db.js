const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
  if (connectDB.isDbOffline()) {
    console.log('Talvion running in OFFLINE mock database mode.');
    return;
  }
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/talvion';
    
    // Bypass Node.js internal DNS resolution bugs for MongoDB Atlas (SRV records)
    if (mongoURI.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '8.8.4.4']);
      } catch (_) {
        // Fallback silently if setting custom DNS servers fails
      }
    }
    
    console.log('Connecting to MongoDB...');
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 2000 // fail fast if mongodb container or local server is down
    });
    
    console.log(`MongoDB Connected Successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n========================================================================`);
    console.error(`❌ MONGODB CONNECTION ERROR: ${error.message}`);
    console.error(`========================================================================`);
    console.error(`Talvion is configured to run with a real database.`);
    console.error(`Please make sure MongoDB is installed and running.`);
    console.error(`\n💡 How to resolve this:`);
    console.error(`1. Install locally: https://www.mongodb.com/try/download/community`);
    console.error(`2. Run via Docker: docker run -d -p 27017:27017 --name talvion-mongo mongo:latest`);
    console.error(`3. Run via Atlas (Cloud): Update MONGODB_URI in your 'backend/.env' file.`);
    console.error(`========================================================================\n`);
    process.exit(1);
  }
};

connectDB.isDbOffline = () => process.env.DB_OFFLINE === 'true';

module.exports = connectDB;

