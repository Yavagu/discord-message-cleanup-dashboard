import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AdminSession } from '../types';

declare global {
  namespace Express {
    interface Request {
      session?: AdminSession;
    }
  }
}

const PUBLIC_EXACT_PATHS = new Set([
  '/auth/login',
  '/api/auth/login',
  '/auth/demo-login',
  '/api/auth/demo-login',
  '/auth/session',
  '/api/auth/session',
  '/health',
  '/api/health'
]);

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const reqPath = req.path;
  const originalUrlPath = (req.originalUrl || '').split('?')[0];

  // Whitelist public endpoints
  if (PUBLIC_EXACT_PATHS.has(reqPath) || PUBLIC_EXACT_PATHS.has(originalUrlPath)) {
    return next();
  }

  const sessionId = req.cookies?.admin_session_id || (req.headers['x-session-id'] as string);

  if (!sessionId) {
    res.status(401).json({
      error: 'Unauthorized: Admin authentication session required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  const session = AuthService.getSession(sessionId);
  if (!session) {
    res.status(401).json({
      error: 'Unauthorized: Session expired or invalid',
      code: 'SESSION_EXPIRED'
    });
    return;
  }

  // Enforce CSRF verification on state-modifying HTTP methods
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const isLogout = reqPath === '/auth/logout' || reqPath === '/api/auth/logout' || originalUrlPath === '/api/auth/logout';

    if (!isLogout) {
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfHeader || typeof csrfHeader !== 'string' || csrfHeader !== session.csrfToken) {
        res.status(403).json({
          error: 'Forbidden: Invalid or missing CSRF token',
          code: 'CSRF_INVALID'
        });
        return;
      }
    }
  }

  req.session = session;
  next();
}
