// src/routes/auth.js — Microsoft Entra ID authentication routes

const crypto = require('crypto');
const express = require('express');
const { config } = require('../config');
const logger = require('../logger');

const router = express.Router();

function getMsalClient(app) {
  if (app && app.locals && app.locals.msalClient) return app.locals.msalClient;

  const msal = require('@azure/msal-node');
  const msalConfig = {
    auth: {
      clientId: config.entraClientId,
      authority: `https://login.microsoftonline.com/${config.entraTenantId || 'common'}`,
      clientSecret: config.entraClientSecret,
    },
  };
  return new msal.ConfidentialClientApplication(msalConfig);
}

/**
 * Save cookie-session and wait for it to commit before continuing.
 * cookie-session patches res.end to write the Set-Cookie header, so we
 * need the session middleware to run before we redirect.
 */
function commitSession(req) {
  return new Promise((resolve) => {
    if (req.session && typeof req.sessionOptions !== 'undefined') {
      // cookie-session is synchronous — the cookie is written on res.end.
      // Touching the session object ensures the cookie will be set.
      req.session._ts = Date.now();
    }
    resolve();
  });
}

/**
 * GET /auth/login — Redirect user to Entra ID authorization endpoint
 */
router.get('/login', async (req, res, next) => {
  try {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    // Store state and nonce in the session so callback can validate them
    req.session.authState = state;
    req.session.authNonce = nonce;

    const client = getMsalClient(req.app);
    const authCodeUrlParams = {
      scopes: ['openid', 'profile'],
      redirectUri: `${config.publicBaseUrl}/auth/callback`,
      state,
      nonce,
    };

    const authUrl = await client.getAuthCodeUrl(authCodeUrlParams);

    // Commit session before redirect so the cookie is set
    await commitSession(req);

    res.redirect(authUrl);
  } catch (err) {
    logger.error('Failed to generate Entra auth URL', { error: err.message });
    next(err);
  }
});

/**
 * GET /auth/callback — Exchange authorization code for token, validate state & nonce
 */
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      logger.error('Entra auth callback error from identity provider', { error, errorDescription });
      return res.status(400).json({
        error: { code: 'AUTH_FAILED', message: errorDescription || error },
      });
    }

    // Validate state
    if (!state || !req.session || req.session.authState !== state) {
      logger.warn('State mismatch or missing in auth callback', { state });
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Invalid or expired state parameter' },
      });
    }

    const savedNonce = req.session.authNonce;

    const client = getMsalClient(req.app);
    const tokenRequest = {
      code,
      scopes: ['openid', 'profile'],
      redirectUri: `${config.publicBaseUrl}/auth/callback`,
      // Pass the same nonce used in getAuthCodeUrl so MSAL can validate it
      nonce: savedNonce,
    };

    const tokenResponse = await client.acquireTokenByCode(tokenRequest);

    // Double-check nonce in the id_token claims
    if (tokenResponse.idTokenClaims && tokenResponse.idTokenClaims.nonce) {
      if (tokenResponse.idTokenClaims.nonce !== savedNonce) {
        logger.warn('Nonce mismatch in id_token claims');
        return res.status(400).json({
          error: { code: 'INVALID_NONCE', message: 'Nonce verification failed' },
        });
      }
    }

    // Store only id (oid claim) and name (display name) in session — never email
    const oid = tokenResponse.idTokenClaims?.oid
      || tokenResponse.account?.homeAccountId
      || tokenResponse.idTokenClaims?.sub
      || 'entra-user';
    const displayName = tokenResponse.idTokenClaims?.name
      || tokenResponse.account?.name
      || 'Entra User';

    req.session.user = {
      id: oid,
      name: displayName,
    };

    // Clear temporary auth state and nonce after successful exchange
    delete req.session.authState;
    delete req.session.authNonce;

    // Commit session before redirect
    await commitSession(req);

    res.redirect('/');
  } catch (err) {
    logger.error('Error exchanging authorization code for token', { error: err.message });
    next(err);
  }
});

/**
 * GET /auth/logout — Clear session cookie and redirect to home
 */
router.get('/logout', (req, res) => {
  if (req.session) {
    req.session = null;
  }
  res.redirect('/');
});

module.exports = router;
