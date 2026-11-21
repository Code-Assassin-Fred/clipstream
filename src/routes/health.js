// src/routes/health.js — Liveness and readiness endpoints

const express = require('express');
const router = express.Router();

/**
 * GET /health — Liveness check: process is up
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * GET /ready — Readiness check: stores are reachable
 * Returns 200 if all dependencies healthy, 503 otherwise
 */
router.get('/ready', async (req, res) => {
  const services = req.app.locals.services;
  const checks = {};

  try {
    checks.media = await services.media.healthCheck();
  } catch (_err) {
    checks.media = false;
  }

  try {
    checks.metadata = await services.metadata.healthCheck();
  } catch (_err) {
    checks.metadata = false;
  }

  const allHealthy = Object.values(checks).every(v => v === true);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    checks,
  });
});

module.exports = router;

