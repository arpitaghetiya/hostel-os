/**
 * Role-based access control middleware.
 * Usage: authorize('warden', 'security') — allows only those roles.
 * Must be used AFTER the authenticate middleware.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. This action requires one of: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = { authorize };
