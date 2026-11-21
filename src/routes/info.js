// src/routes/info.js — Instance details endpoint

const express = require('express');
const { config } = require('../config');
const pkg = require('../../package.json');

const router = express.Router();
const startedAt = new Date().toISOString();

/**
 * GET /api/info — Instance details: instanceId, mode, version, uptime, startedAt
 */
router.get('/info', (_req, res) => {
  res.json({
    instanceId: config.instanceId,
    mode: config.storageMode,
    version: pkg.version,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt,
  });
});

module.exports = router;

