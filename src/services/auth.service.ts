// Radiantilyk EMR — Authentication Service
// Handles user authentication, JWT signing & rotation, MFA setup/verify,
// password history checks, audit log generation, and session management.
//
// Compliance:
// - Password History: Prevents reuse of last 5 passwords via password_histories table
// - Lockout Policy: 5 failed attempts locks account for 15 minutes
// - MFA: TOTP via otplib, secret encrypted with AES-256-GCM
// - Audit Trail: Every auth event logged to auth_audit_logs

import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { encrypt, decrypt, hmacSha256 } from '../utils/encryption';
import { env } from '../config/env';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { UserRoleName, ErrorCodes } from '../types';
import { logger, logAuthEvent, logSecurityEvent } from '../utils/logger';
import { LoginInput, ChangePasswordInput } from '../schemas/auth.schema';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const PASSWORD_HISTORY_LIMIT = 5;
const BCRYPT_SALT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
  user?: {
    id: string;
    email: string;
    roles: UserRoleName[];
  };
  tokens?: AuthTokens;
}

export class AuthService {
  /**
   * User Login — verify credentials, check lockout, check MFA requirement.
   */
  static async login(
    input: LoginInput,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    const { email, password } = input;
    const cleanEmail = email.trim().toLowerCase();

    // 1. Find user by email
    let user = await prisma.user.findFirst({
      where: { email: cleanEmail, deletedAt: null },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      await this.recordAuthAudit(null, cleanEmail, 'LOGIN_FAILED', ipAddress, userAgent, { reason: 'User not found' });
      logAuthEvent('LOGIN_FAILED', cleanEmail, ipAddress, false);
      throw AppError.unauthorized('Invalid email or password');
    }

    // Inactive or soft-deleted accounts get 403
    if (!user.isActive || user.deletedAt) {
      await this.recordAuthAudit(user.id, cleanEmail, 'LOGIN_FAILED', ipAddress, userAgent, { reason: 'Account inactive or deleted' });
      logAuthEvent('LOGIN_FAILED', cleanEmail, ipAddress, false);
      throw AppError.forbidden('Account is inactive or has been deleted');
    }

    // 2. Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordAuthAudit(user.id, cleanEmail, 'ACCOUNT_LOCKED', ipAddress, userAgent, { lockedUntil: user.lockedUntil });
      logSecurityEvent('ACCOUNT_LOCKED_ACCESS_ATTEMPT', 'medium', ipAddress, `Locked account login attempt for ${cleanEmail}`);
      throw new AppError(
        `Account is locked due to multiple failed login attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}`,
        423,
        ErrorCodes.ACCOUNT_LOCKED
      );
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const newFailedAttempts = user.failedAttempts + 1;
      let lockedUntil: Date | undefined = undefined;

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        logSecurityEvent('BRUTE_FORCE_DETECTED', 'high', ipAddress, `Account ${cleanEmail} locked for 15m after ${newFailedAttempts} failed attempts`);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: lockedUntil || undefined,
        },
      });

      await this.recordAuthAudit(user.id, cleanEmail, 'LOGIN_FAILED', ipAddress, userAgent, { failedAttempts: newFailedAttempts });
      logAuthEvent('LOGIN_FAILED', cleanEmail, ipAddress, false);
      throw AppError.unauthorized('Invalid email or password');
    }

    // Reset failed attempts on successful password check
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    const roles = user.userRoles.map((ur) => ur.role.name as UserRoleName);

    // 4. Check MFA Requirement
    if (user.mfaEnabled) {
      // Generate temporary MFA challenge token (valid for 5 minutes)
      const mfaToken = signAccessToken({
        sub: user.id,
        email: user.email,
        roles,
        sessionId: 'mfa_challenge',
      });

      await this.recordAuthAudit(user.id, email, 'MFA_CHALLENGE_ISSUED', ipAddress, userAgent);
      return { mfaRequired: true, mfaToken };
    }

    // 5. Complete Login (Create Session & Tokens)
    const tokens = await this.createSessionAndTokens(user.id, user.email, roles, ipAddress, userAgent);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    await this.recordAuthAudit(user.id, email, 'LOGIN_SUCCESS', ipAddress, userAgent);
    logAuthEvent('LOGIN_SUCCESS', email, ipAddress, true);

    return {
      mfaRequired: false,
      user: { id: user.id, email: user.email, roles },
      tokens,
    };
  }

  /**
   * Verify MFA Code during Login.
   */
  static async verifyMfaLogin(
    mfaToken: string,
    code: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    let payload;
    try {
      payload = verifyAccessToken(mfaToken);
    } catch {
      throw AppError.unauthorized('Invalid or expired MFA challenge token');
    }

    if (!payload || payload.sessionId !== 'mfa_challenge') {
      throw AppError.unauthorized('Invalid MFA challenge token');
    }

    const userId = payload.sub;

    const mfaConfig = await prisma.mfaConfig.findUnique({
      where: { userId },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (!mfaConfig || !mfaConfig.isVerified) {
      throw AppError.badRequest('MFA is not properly set up for this account');
    }

    // Decrypt MFA secret
    const decryptedSecret = decrypt(mfaConfig.secret);
    const isValid = authenticator.verify({ token: code, secret: decryptedSecret });

    if (!isValid) {
      await this.recordAuthAudit(userId, payload.email, 'MFA_FAILED', ipAddress, userAgent);
      throw AppError.unauthorized('Invalid MFA verification code');
    }

    const roles = mfaConfig.user.userRoles.map((ur) => ur.role.name as UserRoleName);
    const tokens = await this.createSessionAndTokens(userId, payload.email, roles, ipAddress, userAgent);

    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    await this.recordAuthAudit(userId, payload.email, 'MFA_VERIFIED', ipAddress, userAgent);
    logAuthEvent('MFA_VERIFIED', payload.email, ipAddress, true);

    return {
      mfaRequired: false,
      user: { id: userId, email: payload.email, roles },
      tokens,
    };
  }

  /**
   * Rotate Refresh Token — Issue new access token + new refresh token.
   */
  static async refreshTokens(
    refreshTokenStr: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthTokens> {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenStr);
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    // Find refresh token in DB by ID, then verify HMAC hash matches
    const storedToken = await prisma.refreshToken.findUnique({
      where: { id: decoded.tokenId },
      include: {
        user: {
          include: { userRoles: { include: { role: true } } },
        },
      },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      if (storedToken?.isRevoked) {
        logSecurityEvent('REFRESH_TOKEN_REUSE_ATTEMPT', 'high', ipAddress, `Revoked refresh token reuse for user ${decoded.sub}`);
      }
      throw AppError.unauthorized('Refresh token is invalid or has been revoked');
    }

    // Verify HMAC hash of the incoming refresh token matches what's stored
    const incomingHash = hmacSha256(refreshTokenStr, env.REFRESH_TOKEN_HMAC_SECRET);
    if (storedToken.token !== incomingHash) {
      logSecurityEvent('REFRESH_TOKEN_HASH_MISMATCH', 'high', ipAddress, `HMAC mismatch for token ${decoded.tokenId}`);
      throw AppError.unauthorized('Refresh token is invalid');
    }

    const user = storedToken.user;
    if (!user.isActive || user.deletedAt) {
      throw AppError.forbidden('User account is inactive or deleted');
    }

    const roles = user.userRoles.map((ur) => ur.role.name as UserRoleName);

    // Revoke old refresh token (Token Rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Create new refresh token and access token
    const newRefreshTokenRecord = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const newAccessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      sessionId: storedToken.id,
    });

    const newRefreshToken = signRefreshToken({
      sub: user.id,
      tokenId: newRefreshTokenRecord.id,
      sessionId: storedToken.id,
    });

    // Store HMAC hash of new refresh token
    const newRefreshTokenHash = hmacSha256(newRefreshToken, env.REFRESH_TOKEN_HMAC_SECRET);
    await prisma.refreshToken.update({
      where: { id: newRefreshTokenRecord.id },
      data: { token: newRefreshTokenHash },
    });

    await this.recordAuthAudit(user.id, user.email, 'TOKEN_REFRESHED', ipAddress, userAgent);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: '15m',
    };
  }

  /**
   * Logout — Revoke session and refresh tokens.
   */
  static async logout(userId: string, sessionId: string, ipAddress: string, userAgent: string): Promise<void> {
    // Delete session
    await prisma.session.deleteMany({
      where: { userId, id: sessionId },
    });

    // Revoke refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await this.recordAuthAudit(userId, user?.email || 'unknown', 'LOGOUT', ipAddress, userAgent);
    logAuthEvent('LOGOUT', user?.email || 'unknown', ipAddress, true);
  }

  /**
   * Setup MFA — Generate QR code secret and recovery codes.
   */
  static async setupMfa(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Radiantilyk EMR', secret);

    // Encrypt secret before storing
    const encryptedSecret = encrypt(secret);

    await prisma.mfaConfig.upsert({
      where: { userId },
      update: { secret: encryptedSecret, isVerified: false },
      create: { userId, secret: encryptedSecret, isVerified: false },
    });

    return {
      secret,
      otpauthUrl,
    };
  }

  /**
   * Verify MFA Setup — Confirm 6-digit code to enable MFA.
   */
  static async verifyMfaSetup(userId: string, code: string, ipAddress: string, userAgent: string): Promise<void> {
    const mfaConfig = await prisma.mfaConfig.findUnique({ where: { userId } });
    if (!mfaConfig) throw AppError.badRequest('MFA setup has not been initiated');

    const decryptedSecret = decrypt(mfaConfig.secret);
    const isValid = authenticator.verify({ token: code, secret: decryptedSecret });

    if (!isValid) {
      throw AppError.badRequest('Invalid verification code');
    }

    await prisma.mfaConfig.update({
      where: { userId },
      data: { isVerified: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    await this.recordAuthAudit(userId, user?.email || 'unknown', 'MFA_ENABLED', ipAddress, userAgent);
  }

  /**
   * Change Password — Enforce password history rules.
   */
  static async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw AppError.badRequest('Current password is incorrect');
    }

    // Check Password History (cannot reuse last 5 passwords)
    const recentHistories = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
    });

    for (const history of recentHistories) {
      const isReused = await bcrypt.compare(input.newPassword, history.passwordHash);
      if (isReused) {
        throw AppError.badRequest(`You cannot reuse any of your last ${PASSWORD_HISTORY_LIMIT} passwords`);
      }
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);

    // Save old password to history
    await prisma.passwordHistory.create({
      data: {
        userId,
        passwordHash: user.passwordHash,
      },
    });

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    await this.recordAuthAudit(userId, user.email, 'PASSWORD_CHANGED', ipAddress, userAgent);
  }

  /**
   * Helper: Create Session & Initial Tokens.
   */
  private static async createSessionAndTokens(
    userId: string,
    email: string,
    roles: UserRoleName[],
    ipAddress: string,
    userAgent: string
  ): Promise<AuthTokens> {
    // Create DB Session
    const session = await prisma.session.create({
      data: {
        userId,
        token: `pending_${Date.now()}_${Math.random()}`,
        ipAddress,
        userAgent: userAgent.substring(0, 500),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const accessToken = signAccessToken({
      sub: userId,
      email,
      roles,
      sessionId: session.id,
    });

    // Create DB RefreshToken record — store HMAC hash, not raw JWT
    const refreshTokenRecord = await prisma.refreshToken.create({
      data: {
        userId,
        token: 'pending', // placeholder, updated below
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const refreshToken = signRefreshToken({
      sub: userId,
      tokenId: refreshTokenRecord.id,
      sessionId: session.id,
    });

    // Store HMAC-SHA256 hash of refresh token in DB (never raw JWT)
    const refreshTokenHash = hmacSha256(refreshToken, env.REFRESH_TOKEN_HMAC_SECRET);

    await prisma.session.update({
      where: { id: session.id },
      data: { token: session.id }, // session token = session id (not the JWT)
    });

    await prisma.refreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: { token: refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  }

  /**
   * Helper: Write Auth Audit Log.
   */
  private static async recordAuthAudit(
    userId: string | null,
    email: string,
    eventType: string,
    ipAddress: string,
    userAgent: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.authAuditLog.create({
        data: {
          userId: userId || undefined,
          email,
          eventType,
          ipAddress,
          userAgent: userAgent.substring(0, 500),
          metadata: metadata ? (metadata as any) : undefined,
        },
      });
    } catch (err) {
      logger.error(`[AUTH_AUDIT] Failed to record auth audit log: ${(err as Error).message}`);
    }
  }
}
