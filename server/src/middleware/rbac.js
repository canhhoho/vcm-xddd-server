/**
 * VCM XDDD - RBAC Middleware
 * Port of role checking from Router.gs
 */

/**
 * Check if user has required role
 * Usage: router.get('/users', rbac(['ADMIN']), handler)
 */
function rbac(requiredRoles = []) {
  return (req, res, next) => {
    if (!requiredRoles || requiredRoles.length === 0) {
      return next();
    }

    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, error: 'Forbidden: No role assigned' });
    }

    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
}

module.exports = rbac;
