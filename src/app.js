// src/app.js — Builds and exports the Express app (no listen)

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const { config } = require('./config');
const { authMiddleware } = require('./middleware/auth');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const infoRoutes = require('./routes/info');
const videoRoutes = require('./routes/videos');
const commentRoutes = require('./routes/comments');

/**
 * Create the Express application.
 * @param {Object} services — { media, metadata, sentiment, transcription }
 * @returns {express.Application}
 */
function createApp(services) {
  const app = express();

  // Store services for route handlers
  app.locals.services = services;

  // Trust proxy for rate limiting and logs behind Azure ingress
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // allow inline scripts for the simple frontend
    crossOriginEmbedderPolicy: false,
  }));

  // Compression for JSON responses
  app.use(compression());

  // CORS
  app.use(cors());

  // Add X-Instance-Id header to every response
  app.use((_req, res, next) => {
    res.set('X-Instance-Id', config.instanceId);
    next();
  });

  // Request logging
  app.use(requestLogger);

  // Body parsing
  app.use(express.json());

  // Authentication — populates req.user
  app.use(authMiddleware);

  // Static files from public/ with cache headers
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProduction ? '1d' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.set('Cache-Control', 'no-cache');
      }
    },
  }));

  // Serve local media files with range support
  if (config.storageMode === 'local') {
    app.use('/media', express.static(path.join(config.localDataDir, 'media'), {
      maxAge: '1d',
      acceptRanges: true,
    }));
  }

  // Routes
  app.use(healthRoutes);
  app.use('/api', infoRoutes);

  // GET /api/me — Current user info
  app.get('/api/me', (req, res) => {
    if (req.user) {
      res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      });
    } else {
      res.json(null);
    }
  });

  // Video and comment routes
  app.use('/api', videoRoutes);
  app.use('/api', commentRoutes);

  // Debug endpoint (only if enabled)
  if (config.enableDebugEndpoints) {
    app.get('/api/debug/burn', (req, res) => {
      const ms = Math.min(parseInt(req.query.ms, 10) || 200, 2000);
      const start = Date.now();
      while (Date.now() - start < ms) {
        // Busy wait to generate CPU load for scaling demos
      }
      res.json({ burned: ms, instanceId: config.instanceId });
    });
  }

  // 404 for unknown /api/* routes
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  // Central error handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
