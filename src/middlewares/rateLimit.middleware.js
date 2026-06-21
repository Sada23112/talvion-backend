const logger = require('../config/logger');

// Lightweight in-memory rate limiting store
const attemptsStore = {};

/**
 * Creates an in-memory rate limiting middleware.
 * @param {Object} options Configuration options
 * @param {number} options.windowMs Time window in milliseconds (default: 15 minutes)
 * @param {number} options.max Limit the number of connections per IP per window (default: 50)
 * @param {string} options.message Error message returned on block (default: Too many requests)
 */
const rateLimit = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 50;
  const message = options.message || 'Too many requests from this IP, please try again later.';

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' || process.env.BYPASS_LIMITER === 'true') {
      return next();
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (!attemptsStore[ip]) {
      attemptsStore[ip] = [];
    }

    // Filter out attempts older than windowMs
    attemptsStore[ip] = attemptsStore[ip].filter(timestamp => now - timestamp < windowMs);

    if (attemptsStore[ip].length >= max) {
      logger.warn(`Rate limit exceeded for IP: ${ip}`, { path: req.originalUrl, attemptsCount: attemptsStore[ip].length });
      
      const error = new Error(message);
      error.statusCode = 429;
      return next(error);
    }

    // Record the current attempt timestamp
    attemptsStore[ip].push(now);
    next();
  };
};

module.exports = rateLimit;
