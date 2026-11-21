// src/middleware/requestLogger.js — Per-request structured logging

const logger = require('../logger');

/**
 * Logs each request with method, path, status, and duration.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}

module.exports = requestLogger;

