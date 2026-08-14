// Radiantilyk EMR — Authentication Middleware
// Phase 1A + Phase 1C-A: Reads JWT access token from HttpOnly cookie (primary)
// with fallback to Authorization: Bearer header (transition compatibility).
//
// Live Database Role Freshness (Requirement 11.E):
// - Verifies user exists in live MySQL database
// - Verifies user isActive === true and deletedAt === null
// - Fetches live server roles from live MySQL on every protected request
// - Account deactivation/role changes take effect immediately

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, AuthenticatedUser, UserRoleName, ErrorCodes } from '../types';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { extractAccessToken } from '../utils/cookies';
import { prisma } from '../config/database';

interface JwtPayload {
  sub: string;       // userId
  email: string;
  roles: string[];
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Authentication middleware — verifies JWT access token and validates live MySQL user state & roles.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token = extractAccessToken(req);

    if (!token) {
      throw new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID);
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    // Resolve client IP (through reverse proxy)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';
    req.clientIp = clientIp;

    // Live Database Role & Active User Validation (Requirement 11.E)
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        deletedAt: true,
        userRoles: {
          select: {
            role: { select: { name: true } }
          }
        }
      }
    });

    if (!dbUser) {
      throw new AppError('User account not found or session invalid', 401, ErrorCodes.TOKEN_INVALID);
    }

    if (!dbUser.isActive || dbUser.deletedAt) {
      await prisma.authAuditLog.create({
        data: {
          userId: decoded.sub,
          email: decoded.email,
          eventType: 'INACTIVE_USER_BLOCKED',
          ipAddress: clientIp,
          userAgent: (req.headers['user-agent'] as string) || null,
          metadata: { reason: 'Account inactive or deleted' },
        }
      }).catch(() => {});

      throw new AppError('Account is inactive or has been disabled', 403, ErrorCodes.FORBIDDEN);
    }

    const liveRoles = dbUser.userRoles.map((ur) => ur.role.name) as UserRoleName[];

    // Populate authenticated user context with live database roles
    const user: AuthenticatedUser = {
      id: dbUser.id,
      email: dbUser.email,
      roles: liveRoles,
      sessionId: decoded.sessionId,
      mustChangePassword: dbUser.mustChangePassword,
    };

    req.user = user;

    // Server-Side mustChangePassword Enforcement
    if (dbUser.mustChangePassword) {
      const path = req.originalUrl || req.path;
      const isAllowedEndpoint =
        path.includes('/auth/me') ||
        path.includes('/auth/password/change') ||
        path.includes('/auth/logout');

      if (!isAllowedEndpoint) {
        throw new AppError('Password change required before accessing the portal', 403, ErrorCodes.FORBIDDEN);
      }
    }

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
 * Safely leaves req.user = undefined on any invalid/expired/deleted token or missing user.
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractAccessToken(req);

  if (!token) {
    req.user = undefined;
    return next(); // Continue without user context
  }

  authenticate(req, res, (err) => {
    if (err) {
      req.user = undefined;
      return next(); // Fail gracefully as guest without user context
    }
    next();
  });
}

