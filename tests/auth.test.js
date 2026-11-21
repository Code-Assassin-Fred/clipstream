// tests/auth.test.js — Tests for authentication middleware

const request = require('supertest');
const { createApp } = require('../src/app');
const { createFakeServices } = require('./helpers');

describe('Authentication Middleware', () => {
  describe('dev mode (default)', () => {
    let app;

    beforeEach(() => {
      // AUTH_MODE defaults to 'dev'
      const services = createFakeServices();
      app = createApp(services);
    });

    test('GET /api/me returns default dev user when no header', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('dev@clipstream.local');
      expect(res.body.name).toBe('Dev User');
    });

    test('GET /api/me returns custom user from X-Dev-User header', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('X-Dev-User', 'alice@test.com');
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('alice@test.com');
    });

    test('protected routes succeed without header in dev mode', async () => {
      // Like a non-existent video should return 404 not 401
      const res = await request(app)
        .post('/api/videos/nonexistent/like');
      expect(res.status).toBe(404);
    });
  });

  describe('easyauth mode', () => {
    let app;
    const originalAuthMode = process.env.AUTH_MODE;

    beforeEach(() => {
      process.env.AUTH_MODE = 'easyauth';
      // Need to clear config cache
      jest.resetModules();
      const { createApp: freshCreateApp } = require('../src/app');
      const { createFakeServices: freshFakeServices } = require('./helpers');
      const services = freshFakeServices();
      app = freshCreateApp(services);
    });

    afterEach(() => {
      if (originalAuthMode) {
        process.env.AUTH_MODE = originalAuthMode;
      } else {
        delete process.env.AUTH_MODE;
      }
      jest.resetModules();
    });

    test('returns 401 on protected route without auth headers', async () => {
      const res = await request(app)
        .post('/api/videos/nonexistent/like');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    test('GET /api/me returns null when not authenticated', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    test('authenticated request succeeds with easyauth headers', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('X-MS-CLIENT-PRINCIPAL-NAME', 'alice@contoso.com')
        .set('X-MS-CLIENT-PRINCIPAL-ID', 'abc123');
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('alice@contoso.com');
      expect(res.body.id).toBe('abc123');
    });
  });
});

