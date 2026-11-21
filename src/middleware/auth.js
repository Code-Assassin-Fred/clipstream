// src/middleware/auth.js — Authentication middleware

const { config } = require('../config');

/**
 * Populate req.user based on AUTH_MODE.
 * - entra: read session user stored by Entra auth code flow
 * - easyauth: read Azure Easy Auth headers
 * - dev: user from X-Dev-User header, or default dev user
 *
 * The user object must never include the email address.
 */
function authMiddleware(req, _res, next) {
  if (config.authMode === 'entra') {
    if (req.session && req.session.user) {
      req.user = {
        id: req.session.user.id,
        name: req.session.user.name,
      };
    }
  } else if (config.authMode === 'easyauth') {
    const principalName = req.headers['x-ms-client-principal-name'];
    const principalId = req.headers['x-ms-client-principal-id'];

    if (principalName) {
      req.user = {
        id: principalId || principalName,
        name: principalName,
      };
    }
    // If headers missing, req.user stays undefined (anonymous)
  } else {
    // Dev mode: use X-Dev-User header or default
    const devUser = req.headers['x-dev-user'];
    if (devUser) {
      req.user = {
        id: devUser,
        name: devUser,
      };
    } else {
      req.user = {
        id: 'dev@clipstream.local',
        name: 'Dev User',
      };
    }
  }

  next();
}

/**
 * Require authenticated user. Returns 401 if req.user is missing.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  }
  next();
}

module.exports = { authMiddleware, requireAuth };

