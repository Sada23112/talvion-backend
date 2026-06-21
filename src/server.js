// Load environment variables as early as possible
require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');

// Environment variables validation
const requiredEnv = ['MONGODB_URI'];
requiredEnv.forEach(envVar => {
  if (!process.env[envVar]) {
    logger.error(`Critical environment variable ${envVar} is missing!`);
    process.exit(1);
  }
});

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.toLowerCase().includes('fallback_secret') || process.env.JWT_SECRET.toLowerCase().includes('change_me')) {
    logger.error('CRITICAL SECURITY ERROR: You must specify a secure JWT_SECRET in production environments!');
    process.exit(1);
  }
} else {
  if (!process.env.JWT_SECRET) {
    logger.warn('JWT_SECRET is missing. Bypassing with fallback key (Development only).');
  }
}

// Handle uncaught exceptions globally to prevent silent errors
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});

// Boot Database
connectDB();

// Determine port
const PORT = process.env.PORT || 5000;

// Listen on designated port
const server = app.listen(PORT, () => {
  logger.info('TALVION BACKEND SERVER STARTED', {
    mode: process.env.NODE_ENV || 'development',
    port: PORT,
    endpoint: `http://localhost:${PORT}/api/v1`,
    health: `http://localhost:${PORT}/health`
  });
});

// Initialize Socket.IO server
const { initSocket } = require('./config/socket');
initSocket(server);

// Handle unhandled promise rejections globally
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down gracefully...', err);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown listeners
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await mongoose.connection.close(false);
      logger.info('MongoDB connection closed successfully.');
      process.exit(0);
    } catch (err) {
      logger.error('Error during MongoDB connection close', err);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if connections hang
  setTimeout(() => {
    logger.warn('Force shutdown triggered after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
