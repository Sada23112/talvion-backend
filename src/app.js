const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRouter = require('./routes/api.router');
const { errorHandler } = require('./middlewares/error.middleware');

const mongoose = require('mongoose');
const logger = require('./config/logger');
const Upload = require('./models/upload.model');

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// 1. Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: false // Allow loading static images in frontend application
}));

const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  : '*';

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. HTTP Request Logger
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Fallback custom handler to serve uploaded media from database if local files are missing (Render container reset)
app.get('/uploads/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);

    // 1. If the file exists on the local file system, serve it directly
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    // 2. Otherwise, look up the file in MongoDB if database is online
    if (mongoose.connection.readyState === 1) {
      const fileDoc = await Upload.findOne({ filename });
      if (fileDoc) {
        res.set('Content-Type', fileDoc.contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(fileDoc.data);
      }
    }

    // 3. Fallback to 404
    logger.warn(`Upload resource not found: /uploads/${filename}`);
    res.status(404).json({
      status: 'error',
      message: `Resource not found: /uploads/${filename}`
    });
  } catch (error) {
    next(error);
  }
});

// Static files route for uploaded media
app.use('/uploads', express.static(uploadsDir));

// 3. Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. API Endpoints Registration
app.use('/api/v1', apiRouter);

// Basic Root & Health Check endpoint
app.get('/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const status = isDbConnected ? 200 : 500;
  
  res.status(status).json({
    status: isDbConnected ? 'success' : 'error',
    message: isDbConnected ? 'Talvion API service is running normally.' : 'Database service is unavailable.',
    timestamp: new Date().toISOString(),
    services: {
      database: isDbConnected ? 'up' : 'down',
      uptime: Math.round(process.uptime())
    }
  });
});

// Fallback Route for Undefined Endpoints
app.use('*', (req, res, next) => {
  const err = new Error(`Resource not found: ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
});

// 5. Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
