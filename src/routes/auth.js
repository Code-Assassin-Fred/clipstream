// src/routes/auth.js — Microsoft Entra ID authentication routes

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { config } = require('../config');
const logger = require('../logger');

const router = express.Router();

function getMsalClient(app, customClient = null) {
  if (customClient) return customClient;
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
 * GET /auth/login — Redirect user to Entra ID authorization endpoint
 */
router.get('/login', async (req, res, next) => {
  try {
    const state = uuidv4();
    const nonce = uuidv4();

    if (req.session) {
      req.session.authState = state;
      req.session.authNonce = nonce;
    }

    const client = getMsalClient(req.app);
    const authCodeUrlParams = {
      scopes: ['openid', 'profile'],
      redirectUri: `${config.publicBaseUrl}/auth/callback`,
      state,
      nonce,
    };

    const authUrl = await client.getAuthCodeUrl(authCodeUrlParams);
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

    if (!state || !req.session || req.session.authState !== state) {
      logger.warn('State mismatch or missing in auth callback', { state });
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Invalid or expired state parameter' },
      });
    }

    const client = getMsalClient(req.app);
    const tokenRequest = {
      code,
      scopes: ['openid', 'profile'],
      redirectUri: `${config.publicBaseUrl}/auth/callback`,
    };

    const tokenResponse = await client.acquireTokenByCode(tokenRequest);

    // Validate nonce if present
    if (tokenResponse.idTokenClaims && tokenResponse.idTokenClaims.nonce && req.session.authNonce) {
      if (tokenResponse.idTokenClaims.nonce !== req.session.authNonce) {
        return res.status(400).json({
          error: { code: 'INVALID_NONCE', message: 'Nonce verification failed' },
        });
      }
    }

    // Store only id (oid claim) and name (display name) in session — never email
    const oid = tokenResponse.idTokenClaims?.oid || tokenResponse.account?.homeAccountId || tokenResponse.idTokenClaims?.sub || 'entra-user';
    const displayName = tokenResponse.idTokenClaims?.name || tokenResponse.account?.name || 'Entra User';

    req.session.user = {
      id: oid,
      name: displayName,
    };

    // Clean up temporary auth state
    delete req.session.authState;
    delete req.session.authNonce;

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
