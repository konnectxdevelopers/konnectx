import jwt from 'jsonwebtoken';

export function createAuthMiddleware(config) {
  return function requireAuthentication(req, res, next) {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'unauthorized', message: 'Sign in is required.' });
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret, {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        return res.status(401).json({ code: 'unauthorized', message: 'Invalid access token.' });
      }
      req.auth = { userId: payload.sub };
      return next();
    } catch {
      return res.status(401).json({ code: 'unauthorized', message: 'Invalid or expired access token.' });
    }
  };
}
