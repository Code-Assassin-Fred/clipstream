// tests/health.test.js — Tests for health, readiness, and info endpoints

const request = require('supertest');
const { createTestApp } = require('./helpers');

describe('Health and Info Endpoints', () => {
  let app;

  beforeEach(() => {
    ({ app } = createTestApp());
  });

  describe('GET /health', () => {
    test('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('includes X-Instance-Id header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-instance-id']).toBeDefined();
    });

    test('uses CONTAINER_APP_REPLICA_NAME for X-Instance-Id when set', async () => {
      const prevReplica = process.env.CONTAINER_APP_REPLICA_NAME;
      process.env.CONTAINER_APP_REPLICA_NAME = 'ca-replica-xyz12';
      try {
        const res = await request(app).get('/health');
        expect(res.headers['x-instance-id']).toBe('ca-replica-xyz12');
      } finally {
        if (prevReplica !== undefined) {
          process.env.CONTAINER_APP_REPLICA_NAME = prevReplica;
        } else {
          delete process.env.CONTAINER_APP_REPLICA_NAME;
        }
      }
    });
  });

  describe('GET /ready', () => {
    test('returns 200 when all services healthy', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.media).toBe(true);
      expect(res.body.checks.metadata).toBe(true);
    });

    test('returns 503 when a service is unhealthy', async () => {
      const { createFakeServices } = require('./helpers');
      const { createApp } = require('../src/app');
      const services = createFakeServices();
      services.media.healthCheck = async () => false;
      const unhealthyApp = createApp(services);

      const res = await request(unhealthyApp).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.media).toBe(false);
    });
  });

  describe('GET /api/info', () => {
    test('returns instance details', async () => {
      const res = await request(app).get('/api/info');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('instanceId');
      expect(res.body).toHaveProperty('mode');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptimeSeconds');
      expect(res.body).toHaveProperty('startedAt');
    });

    test('returns process.env.APP_VERSION when set', async () => {
      const prevVersion = process.env.APP_VERSION;
      process.env.APP_VERSION = 'v2.5.0-cloud';
      try {
        const res = await request(app).get('/api/info');
        expect(res.status).toBe(200);
        expect(res.body.version).toBe('v2.5.0-cloud');
      } finally {
        if (prevVersion !== undefined) {
          process.env.APP_VERSION = prevVersion;
        } else {
          delete process.env.APP_VERSION;
        }
      }
    });

    test('returns CONTAINER_APP_REPLICA_NAME in info when set', async () => {
      const prevReplica = process.env.CONTAINER_APP_REPLICA_NAME;
      process.env.CONTAINER_APP_REPLICA_NAME = 'ca-replica-abc99';
      try {
        const res = await request(app).get('/api/info');
        expect(res.status).toBe(200);
        expect(res.body.instanceId).toBe('ca-replica-abc99');
      } finally {
        if (prevReplica !== undefined) {
          process.env.CONTAINER_APP_REPLICA_NAME = prevReplica;
        } else {
          delete process.env.CONTAINER_APP_REPLICA_NAME;
        }
      }
    });
  });

  describe('Unknown API routes', () => {
    test('returns 404 for unknown /api/ routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});

