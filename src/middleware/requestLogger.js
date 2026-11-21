// src/middleware/requestLogger.js — Per-request structured logging

const logger = require('../logger');

/**
 * Logs each request with method, path, status, and duration.
 * For /auth/* routes, logs only req.path (never query strings that
 * may contain authorization codes, tokens, or secrets).
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;

    // Never log query strings on auth routes — they contain codes and tokens
    const loggedPath = req.path.startsWith('/auth/')
      ? req.path
      : req.originalUrl;

    logger.info('request', {
      method: req.method,
      path: loggedPath,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}

module.exports = requestLogger;
