const logger = {
  info(message, meta = {}) {
    const log = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(log));
    } else {
      console.log(`[\x1b[32mINFO\x1b[0m]  ${log.timestamp} - ${message}`, Object.keys(meta).length ? meta : '');
    }
  },

  warn(message, meta = {}) {
    const log = {
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    if (process.env.NODE_ENV === 'production') {
      console.warn(JSON.stringify(log));
    } else {
      console.warn(`[\x1b[33mWARN\x1b[0m]  ${log.timestamp} - ${message}`, Object.keys(meta).length ? meta : '');
    }
  },

  error(message, error = {}, meta = {}) {
    const log = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...meta
    };
    if (process.env.NODE_ENV === 'production') {
      console.error(JSON.stringify(log));
    } else {
      console.error(`[\x1b[31mERROR\x1b[0m] ${log.timestamp} - ${message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }
};

module.exports = logger;
