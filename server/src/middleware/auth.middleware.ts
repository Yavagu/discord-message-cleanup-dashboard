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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  const originalUrl = req.originalUrl || '';

  // Allow public endpoints
  if (
    path === '/auth/login' ||
    path === '/api/auth/login' ||
    originalUrl.startsWith('/api/auth/login') ||
    path === '/auth/demo-login' ||
    path === '/api/auth/demo-login' ||
    originalUrl.startsWith('/api/auth/demo-login') ||
    path === '/auth/session' ||
    path === '/api/auth/session' ||
    originalUrl.startsWith('/api/auth/session') ||
    path.startsWith('/health') ||
    originalUrl.startsWith('/api/health')
  ) {
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

  // CSRF verification on state-modifying methods (POST, PUT, DELETE, PATCH)
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'];
    // For SSE or specific cases if needed, but standard requests must supply x-csrf-token
    if (!path.includes('/auth/logout') && !path.includes('/auth/login') && !path.includes('/auth/demo-login')) {
      if (!csrfHeader || csrfHeader !== session.csrfToken) {
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
