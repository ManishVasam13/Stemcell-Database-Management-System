const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch (_) {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

/** allow(...roles) – only these roles may call the route */
function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your role does not have access to this action' });
    }
    next();
  };
}

module.exports = { authenticate, allow };
