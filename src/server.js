// src/server.js — Starts HTTP server with graceful shutdown

const { config, validateAzureConfig } = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

async function start() {
  // Validate Azure config if in azure mode
  validateAzureConfig();

  // Initialize services (lazy-loaded based on storage mode)
  const { createServices } = require('./services');
  const services = await createServices();

  const app = createApp(services);

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('Server started', {
      port: config.port,
      mode: config.storageMode,
      authMode: config.authMode,
      nodeEnv: config.nodeEnv,
    });
  });

  // Graceful shutdown: stop accepting connections, finish in-flight requests, exit
  function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

