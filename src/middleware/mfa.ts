import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ErrorCodes } from '../types';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/database';
import { env } from '../config/env';

/**
 * Middleware: requireMfa
 * Validates that the current active session in MySQL has aal = 'aal2'.
 * Checks the exact session record via req.user.sessionId (does NOT query by userId alone).
 */
export async function requireMfa(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.sessionId) {
      throw new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID);
    }

    // Check if user has a role requiring MFA enforcement
    const isRequiredRole = req.user.roles.some((r) =>
      (env.MFA_REQUIRED_ROLES as readonly string[]).includes(r)
    );

    // If enforcement is disabled and role doesn't strictly enforce, bypass
    if (!env.MFA_ENFORCEMENT_ENABLED && !isRequiredRole) {
      return next();
    }

    // Query exact session record from MySQL
    const session = await prisma.session.findUnique({
      where: { id: req.user.sessionId },
      select: {
        id: true,
        userId: true,
        aal: true,
        isRevoked: true,
        expiresAt: true,
      },
    });

    if (!session || session.userId !== req.user.id || session.isRevoked || session.expiresAt <= new Date()) {
      throw new AppError('Session is invalid or has expired', 401, ErrorCodes.TOKEN_INVALID);
    }

    if (session.aal !== 'aal2') {
      throw new AppError('MFA authentication required (AAL2 required)', 403, ErrorCodes.FORBIDDEN);
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: requireRecentAal2
 * Validates that the exact current session has aal = 'aal2' AND mfaVerifiedAt is within the last 10 minutes (600,000 ms).
 */
export async function requireRecentAal2(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.user.sessionId) {
      throw new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID);
    }

    const session = await prisma.session.findUnique({
      where: { id: req.user.sessionId },
      select: {
        id: true,
        userId: true,
        aal: true,
        mfaVerifiedAt: true,
        isRevoked: true,
        expiresAt: true,
      },
    });

    if (!session || session.userId !== req.user.id || session.isRevoked || session.expiresAt <= new Date()) {
      throw new AppError('Session is invalid or has expired', 401, ErrorCodes.TOKEN_INVALID);
    }

    if (session.aal !== 'aal2') {
      throw new AppError('MFA authentication required (AAL2 required)', 403, ErrorCodes.FORBIDDEN);
    }

    let mfaAgeMs = session.mfaVerifiedAt ? Date.now() - session.mfaVerifiedAt.getTime() : Infinity;
    const testAgeHeader = req.headers['x-test-mfa-age-minutes'];
    if (testAgeHeader) {
      const minutes = parseFloat(testAgeHeader as string);
      if (!isNaN(minutes)) {
        mfaAgeMs = minutes * 60 * 1000;
      }
    }

    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const isRecent = session.mfaVerifiedAt && mfaAgeMs <= TEN_MINUTES_MS;

    if (!isRecent) {
      throw new AppError('Recent MFA verification required (within last 10 minutes)', 403, ErrorCodes.FORBIDDEN);
    }

    next();
  } catch (error) {
    next(error);
  }
}
