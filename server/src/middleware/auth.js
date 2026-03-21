/**
 * VCM XDDD - Auth Middleware
 * Port of AuthMiddleware from Router.gs
 */
const SecurityService = require('../services/securityService');

// Public routes that don't require authentication
// Note: when mounted on /api, req.path is relative (e.g. /auth/login, /ping)
const PUBLIC_PATHS = [
  '/auth/login',
  '/meta/app',
  '/ping',
];

function authMiddleware(req, res, next) {
  // Skip auth for public paths (check both relative path and full originalUrl)
  const path = req.path;
  const fullPath = req.originalUrl;
  if (PUBLIC_PATHS.some(p => path.startsWith(p) || fullPath.startsWith('/api' + p))) {
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const user = SecurityService.verifyToken(token);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }

  // Inject verified user info into request
  req.user = {
    id: user.uid,
    email: user.email,
    role: user.role,
  };

  next();
}

module.exports = authMiddleware;
