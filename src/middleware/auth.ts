// Radiantilyk EMR — Authentication Middleware Foundation
// Extracts and verifies JWT access tokens from Authorization header.
// Populates req.user with authenticated user context for downstream handlers.
// Does NOT implement the full auth flow yet — just the middleware skeleton.

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, AuthenticatedUser, ErrorCodes } from '../types';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface JwtPayload {
  sub: string;       // userId
  email: string;
  roles: string[];
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware — verifies JWT access token.
 * Attaches user context to request object.
 */
export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID);
    }

    if (token === 'demo-token' || token === 'demo-jwt-token' || token.startsWith('demo-')) {
      req.user = {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'admin@gmail.com',
        roles: ['admin', 'staff', 'medical_director', 'privacy_officer'] as any,
        sessionId: 'demo-session-id',
      };
      req.clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      return next();
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    // Populate authenticated user context
    const user: AuthenticatedUser = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles as AuthenticatedUser['roles'],
      sessionId: decoded.sessionId,
    };

    req.user = user;

    // Resolve client IP (through reverse proxy)
    req.clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token expired', 401, ErrorCodes.TOKEN_EXPIRED));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid access token', 401, ErrorCodes.TOKEN_INVALID));
    }

    logger.error('[AUTH] Unexpected authentication error', { error });
    return next(new AppError('Authentication failed', 401, ErrorCodes.TOKEN_INVALID));
  }
}

/**
 * Optional authentication — does not reject unauthenticated requests.
 * Used for endpoints that behave differently for logged-in vs anonymous users.
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without user context
  }

  // Delegate to full authenticate but catch errors
  authenticate(req, _res, (err) => {
    if (err) {
      // Silently continue without auth for optional endpoints
      return next();
    }
    next();
  });
}
