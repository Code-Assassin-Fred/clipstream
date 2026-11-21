// src/middleware/errorHandler.js — Central error handler

const logger = require('../logger');
const { config } = require('../config');

/**
 * Express error-handling middleware.
 * Returns JSON errors without leaking stack traces in production.
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = status === 500 && config.isProduction
    ? 'An internal error occurred'
    : err.message || 'An internal error occurred';

  logger.error('Request error', {
    method: req.method,
    path: req.path,
    status,
    code,
    message: err.message,
    ...(config.isProduction ? {} : { stack: err.stack }),
  });

  res.status(status).json({
    error: { code, message },
  });
}

module.exports = errorHandler;

