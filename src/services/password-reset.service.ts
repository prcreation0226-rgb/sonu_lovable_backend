// Radiantilyk EMR — Password Reset Service
// Secure, production-grade password reset token generation, verification, and password history enforcement.

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { EmailService } from './email.service';
import { PasswordPolicyService } from './passwordPolicy.service';

export class PasswordResetService {
  /**
   * Initiate password reset by email.
   * Generates a 32-byte cryptographically secure token, stores its SHA-256 hash in DB,
   * dispatches email via centralized EmailService, and ALWAYS returns a generic response to prevent account enumeration.
   */
  static async requestPasswordReset(
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    const cleanEmail = (email || '').trim().toLowerCase();

    // Always record audit log event
    await prisma.authAuditLog.create({
      data: {
        email: cleanEmail,
        eventType: 'PASSWORD_RESET_REQUEST',
        ipAddress,
        userAgent: userAgent || null,
      },
    });

    const user = await prisma.user.findFirst({
      where: { email: cleanEmail, isActive: true, deletedAt: null },
    });

    if (user) {
      // 1. Generate 32-byte random raw token and compute SHA-256 hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // 2. Invalidate any existing unused reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // 3. Store hashed token in DB with 30-minute expiry
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          requestedIp: ipAddress,
          userAgent: userAgent || null,
        },
      });

      // 4. Dispatch password reset email via centralized EmailService
      try {
        const resetUrl = `${env.CORS_ORIGIN}/staff/reset-password?token=${rawToken}`;
        await EmailService.sendPasswordResetEmail({
          to: cleanEmail,
          resetUrl,
          userId: user.id,
        });
      } catch (err) {
        logger.warn(`[PASSWORD_RESET] Failed to dispatch reset email for ${cleanEmail}`);
      }
    }

    return {
      message: 'If an account exists, password reset instructions have been sent.',
    };
  }

  /**
   * Reset user password using opaque raw token.
   * Hashes token, verifies validity & expiry, enforces password policy & 5-password history rule,
   * transactionally updates password & revokes sessions, and logs security audit event.
   */
  static async resetPassword(
    rawToken: string,
    newPassword: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('Invalid or expired password reset link.', 400);
    }

    // Enforce strong password complexity & HIBP pwned check
    await PasswordPolicyService.validatePassword(newPassword);


    // Compute SHA-256 hash of raw token
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt < new Date() ||
      !tokenRecord.user ||
      !tokenRecord.user.isActive ||
      tokenRecord.user.deletedAt
    ) {
      throw new AppError('Invalid or expired password reset link.', 400);
    }

    const user = tokenRecord.user;

    // Enforce 5-password history rule
    const currentMatch = await bcrypt.compare(newPassword, user.passwordHash);
    if (currentMatch) {
      throw new AppError('Password cannot be one of your last 5 passwords.', 400);
    }

    const recentHistory = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const hist of recentHistory) {
      const isMatch = await bcrypt.compare(newPassword, hist.passwordHash);
      if (isMatch) {
        throw new AppError('Password cannot be one of your last 5 passwords.', 400);
      }
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Transactionally update password, history, token usage, and revoke sessions
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: newPasswordHash,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.session.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    // Record audit log event
    await prisma.authAuditLog.create({
      data: {
        userId: user.id,
        email: user.email,
        eventType: 'PASSWORD_CHANGED',
        ipAddress,
        userAgent: userAgent || null,
        metadata: { method: 'password_reset_token' },
      },
    });

    return {
      message: 'Password updated successfully.',
    };
  }
}
