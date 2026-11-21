// src/logger.js — Structured JSON logging

const { config } = require('./config');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.isProduction ? 'info' : 'debug';

/**
 * Emit a structured JSON log line
 */
function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    instanceId: config.instanceId,
    message,
    ...meta,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

const logger = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};

module.exports = logger;

