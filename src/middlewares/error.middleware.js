const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`API Error: ${message}`, err, {
    path: req.originalUrl,
    method: req.method,
    status: statusCode
  });

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    // Hide details & stack traces in production environments
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = { errorHandler };
