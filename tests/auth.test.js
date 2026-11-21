// tests/auth.test.js — Tests for authentication middleware and Microsoft Entra ID flow

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

    test('GET /api/me returns default dev user when no header (display name only, no email)', async () => {
      const res = await request(app).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Dev User');
      expect(res.body.id).toBe('dev@clipstream.local');
      expect(res.body.email).toBeUndefined();
    });

    test('GET /api/me returns custom user from X-Dev-User header (no email)', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('X-Dev-User', 'alice@test.com');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('alice@test.com');
      expect(res.body.id).toBe('alice@test.com');
      expect(res.body.email).toBeUndefined();
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

    test('authenticated request succeeds with easyauth headers (display name only, no email)', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('X-MS-CLIENT-PRINCIPAL-NAME', 'Alice Smith')
        .set('X-MS-CLIENT-PRINCIPAL-ID', 'abc123');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alice Smith');
      expect(res.body.id).toBe('abc123');
      expect(res.body.email).toBeUndefined();
    });
  });

  describe('entra mode (Microsoft Entra ID / MSAL)', () => {
    let app;
    let mockMsalClient;
    const originalAuthMode = process.env.AUTH_MODE;

    beforeEach(() => {
      process.env.AUTH_MODE = 'entra';
      jest.resetModules();

      mockMsalClient = {
        getAuthCodeUrl: jest.fn().mockImplementation((params) => {
          return Promise.resolve(
            `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=mock-client-id&state=${params.state}&nonce=${params.nonce}`,
          );
        }),
        acquireTokenByCode: jest.fn().mockImplementation((params) => {
          // Echo the nonce back in idTokenClaims so MSAL nonce validation passes
          return Promise.resolve({
            account: { homeAccountId: 'oid-98765', name: 'Jane Contoso' },
            idTokenClaims: {
              oid: 'oid-98765',
              name: 'Jane Contoso',
              nonce: params.nonce,
              preferred_username: 'jane@contoso.com', // Must be omitted from session/user
            },
          });
        }),
      };

      const { createApp: freshCreateApp } = require('../src/app');
      const { createFakeServices: freshFakeServices } = require('./helpers');
      const services = freshFakeServices();
      app = freshCreateApp(services, { msalClient: mockMsalClient });
    });

    afterEach(() => {
      if (originalAuthMode) {
        process.env.AUTH_MODE = originalAuthMode;
      } else {
        delete process.env.AUTH_MODE;
      }
      jest.resetModules();
    });

    test('GET /auth/login redirects to Entra ID and preserves state in cookie', async () => {
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('login.microsoftonline.com');
      expect(res.headers.location).toContain('state=');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    test('GET /auth/callback succeeds, validates state, and populates session with no email in /api/me', async () => {
      const agent = request.agent(app);

      // Step 1: Initiate login to get state & session cookie
      const loginRes = await agent.get('/auth/login');
      const stateMatch = loginRes.headers.location.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      const state = stateMatch[1];

      // Step 2: Callback with matching state
      const callbackRes = await agent.get(`/auth/callback?code=mock-auth-code&state=${state}`);
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe('/');
      expect(mockMsalClient.acquireTokenByCode).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'mock-auth-code' }),
      );

      // Step 3: Verify /api/me has display name and ID, but NO email
      const meRes = await agent.get('/api/me');
      expect(meRes.status).toBe(200);
      expect(meRes.body.id).toBe('oid-98765');
      expect(meRes.body.name).toBe('Jane Contoso');
      expect(meRes.body.email).toBeUndefined();
    });

    test('nonce passed to acquireTokenByCode matches the one from login redirect', async () => {
      const agent = request.agent(app);

      // Step 1: Login — capture nonce from the redirect URL
      const loginRes = await agent.get('/auth/login');
      const nonceMatch = loginRes.headers.location.match(/nonce=([^&]+)/);
      expect(nonceMatch).toBeTruthy();
      const loginNonce = nonceMatch[1];

      const stateMatch = loginRes.headers.location.match(/state=([^&]+)/);
      const state = stateMatch[1];

      // Step 2: Callback
      await agent.get(`/auth/callback?code=mock-auth-code&state=${state}`);

      // Step 3: Verify the nonce passed to acquireTokenByCode is the same one
      const tokenReqArg = mockMsalClient.acquireTokenByCode.mock.calls[0][0];
      expect(tokenReqArg.nonce).toBe(loginNonce);
    });

    test('GET /auth/callback rejects state mismatch with 400', async () => {
      const agent = request.agent(app);

      // Initiate login to establish valid state in session
      await agent.get('/auth/login');

      // Callback with tampered/invalid state
      const callbackRes = await agent.get('/auth/callback?code=mock-auth-code&state=invalid-tampered-state');
      expect(callbackRes.status).toBe(400);
      expect(callbackRes.body.error.code).toBe('INVALID_STATE');
    });

    test('GET /auth/logout clears session', async () => {
      const agent = request.agent(app);

      // Login
      const loginRes = await agent.get('/auth/login');
      const state = loginRes.headers.location.match(/state=([^&]+)/)[1];
      await agent.get(`/auth/callback?code=mock-auth-code&state=${state}`);

      // Confirm logged in
      const meBefore = await agent.get('/api/me');
      expect(meBefore.body).not.toBeNull();
      expect(meBefore.body.name).toBe('Jane Contoso');

      // Logout
      const logoutRes = await agent.get('/auth/logout');
      expect(logoutRes.status).toBe(302);
      expect(logoutRes.headers.location).toBe('/');

      // Confirm session is cleared
      const meAfter = await agent.get('/api/me');
      expect(meAfter.status).toBe(200);
      expect(meAfter.body).toBeNull();
    });
  });
});
