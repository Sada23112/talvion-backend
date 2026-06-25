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


// Static files route for uploaded media
app.use('/uploads', express.static(uploadsDir));

// Serve React Admin Dashboard static files
const publicAdminDir = path.join(__dirname, '../public/admin');
app.use('/admin', express.static(publicAdminDir));

// 3. Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. API Endpoints Registration
app.use('/api/v1', apiRouter);

// Fallback routing for React Admin SPA (BrowserRouter support)
app.get('/admin/*', (req, res) => {
  const indexFile = path.join(publicAdminDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Admin Dashboard assets not built. Please run npm run build in the admin directory.');
  }
});

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
