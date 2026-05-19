// ============================================================
// Enterprise Calendar Sync — Auth Middleware
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { UserRole, JwtPayload } from '../types';
import { authLogger, securityLogger } from '../utils/logger';
import getDatabase from '../database/client';

// Extend Express Request to include auth data
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
    }
  }
}

/**
 * Verify JWT token from Authorization header or cookie.
 * Rejects requests with invalid/expired/missing tokens.
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Extract token from header or cookie
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.token;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : cookieToken;

    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // Verify and decode JWT
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Verify user still exists and is active
    const db = getDatabase();
    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      authLogger.warn({ userId: decoded.sub }, 'Token valid but user inactive or deleted');
      res.status(401).json({
        success: false,
        error: { code: 'USER_INACTIVE', message: 'Account is deactivated' },
      });
      return;
    }

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Session expired. Please login again.' },
      });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      securityLogger.warn({ error: (error as Error).message, ip: req.ip }, 'Invalid JWT token');
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid authentication token' },
      });
      return;
    }
    next(error);
  }
}

/**
 * Role-based access control middleware.
 * Restricts access to users with specified roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const userRole = req.user.role as UserRole;
    if (!allowedRoles.includes(userRole)) {
      securityLogger.warn({
        userId: req.user.sub,
        role: userRole,
        requiredRoles: allowedRoles,
        path: req.path,
      }, 'Access denied — insufficient role');

      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' },
      });
      return;
    }

    next();
  };
}

/**
 * Generate a JWT token for a user.
 */
export function generateJWT(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as any
  );
}

/**
 * Optional auth — attaches user if token is present, but doesn't reject.
 * Used for endpoints that work with or without auth (e.g., health).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.token;

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
      req.user = decoded;
    }
  } catch {
    // Token invalid — proceed without auth
  }
  next();
}
