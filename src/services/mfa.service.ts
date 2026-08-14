import { authenticator } from 'otplib';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import {
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
  generateChallengeToken,
  hashChallengeToken,
} from '../utils/mfaCrypto';
import { writeAuditLog } from '../middleware/audit';

// Configure authenticator options
authenticator.options = {
  window: 1, // Allow 1 step (30s) drift before/after
};

export class MfaService {


  /**
   * Get MFA enrollment and factor status for user
   */
  static async getMfaStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true },
    });
    if (!user) throw AppError.notFound('User');

    const factors = await prisma.mfaFactor.findMany({
      where: { userId, status: 'active', disabledAt: null },
      select: { id: true, factorType: true, status: true, verifiedAt: true, createdAt: true },
    });

    const recoveryCodesCount = await prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null, revokedAt: null },
    });

    return {
      mfaEnabled: user.mfaEnabled && factors.length > 0,
      factorsCount: factors.length,
      activeFactors: factors,
      hasRecoveryCodes: recoveryCodesCount > 0,
      remainingRecoveryCodes: recoveryCodesCount,
    };
  }

  /**
   * Start TOTP Enrollment: Generate TOTP secret & QR code URI
   */
  static async startEnrollment(userId: string, clientIp: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    // Soft-disable existing pending factors for user
    await prisma.mfaFactor.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'disabled', disabledAt: new Date() },
    });

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Radiantilyk EMR', secret);
    const secretEncrypted = encryptMfaSecret(secret);

    const factor = await prisma.mfaFactor.create({
      data: {
        userId,
        factorType: 'totp',
        status: 'pending',
        secretEncrypted,
        otpauthUrl,
      },
    });

    await writeAuditLog({
      userId,
      action: 'MFA_ENROLL_STARTED',
      resourceType: 'mfa_factor',
      resourceId: factor.id,
      ipAddress: clientIp,
      newValue: { factorType: 'totp' },
    });

    return {
      factorId: factor.id,
      secret, // Returned ONLY ONCE during start enrollment
      otpauthUrl,
    };
  }

  /**
   * Complete Enrollment: Verify 6-digit code and generate Recovery Codes
   */
  static async verifyEnrollment(userId: string, factorId: string, code: string, clientIp: string) {
    const factor = await prisma.mfaFactor.findFirst({
      where: { id: factorId, userId, disabledAt: null },
    });
    if (!factor) throw AppError.notFound('MFA Factor');

    const plaintextSecret = decryptMfaSecret(factor.secretEncrypted);
    const isValid = authenticator.verify({ token: code, secret: plaintextSecret });

    if (!isValid) {
      throw AppError.badRequest('Invalid 6-digit MFA verification code');
    }

    const currentStep = Math.floor(Date.now() / 30000);
    if (factor.lastUsedStep === currentStep) {
      throw AppError.badRequest('MFA code already used. Please wait for the next 6-digit code.');
    }

    // Atomic TOTP step update
    const updatedCount = await prisma.$executeRaw`
      UPDATE mfa_factors 
      SET last_used_step = ${currentStep}
      WHERE id = ${factor.id} AND (last_used_step IS NULL OR last_used_step < ${currentStep})
    `;

    if (Number(updatedCount) === 0) {
      throw AppError.badRequest('MFA code already used. Please wait for the next 6-digit code.');
    }

    const now = new Date();

    // Soft-revoke previous recovery codes
    await prisma.mfaRecoveryCode.updateMany({
      where: { userId, revokedAt: null, usedAt: null },
      data: { revokedAt: now },
    });

    // Generate 10 new recovery codes hashed with HMAC-SHA256
    const recoveryCodes = generateRecoveryCodes(10);

    await prisma.$transaction(
      async (tx) => {

      // Activate factor
      await tx.mfaFactor.update({
        where: { id: factor.id },
        data: {
          status: 'active',
          verifiedAt: now,
          lastUsedStep: currentStep,
        },
      });

      // Mark user MFA enabled
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });

      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((rc) => ({
          userId,
          codeHash: hashRecoveryCode(rc),
        })),
      });
    },
    { timeout: 20000 }
    );




    await writeAuditLog({
      userId,
      action: 'MFA_ENROLL_COMPLETED',
      resourceType: 'mfa_factor',
      resourceId: factor.id,
      ipAddress: clientIp,
      newValue: { status: 'active', recoveryCodesGenerated: recoveryCodes.length },
    });

    return {
      success: true,
      recoveryCodes, // Returned ONLY ONCE upon successful enrollment!
    };
  }

  /**
   * Create Login or Enrollment MFA Challenge.
   * Challenge token is hashed with HMAC-SHA256 before saving to DB.
   * Returns opaque raw challenge token to be placed ONLY in HttpOnly cookie.
   */
  static async createChallenge(userId: string, scope: 'MFA_LOGIN' | 'MFA_ENROLLMENT' = 'MFA_LOGIN', factorId?: string) {
    const rawChallengeToken = generateChallengeToken();
    const challengeTokenHash = hashChallengeToken(rawChallengeToken);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const challenge = await prisma.mfaChallenge.create({
      data: {
        userId,
        factorId: factorId || null,
        challengeTokenHash,
        scope,
        attemptsCount: 0,
        maxAttempts: 5,
        expiresAt,
      },
    });

    return {
      rawChallengeToken, // To be set in HttpOnly cookie ONLY
      challengeId: challenge.id,
      expiresAt,
    };
  }

  /**
   * Cancel pending MFA Challenge
   */
  static async cancelChallenge(rawChallengeToken: string, clientIp: string): Promise<void> {
    const challengeTokenHash = hashChallengeToken(rawChallengeToken);
    const challenge = await prisma.mfaChallenge.findUnique({
      where: { challengeTokenHash },
    });

    if (challenge && !challenge.verifiedAt && !challenge.revokedAt) {
      await prisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { revokedAt: new Date() },
      });

      await writeAuditLog({
        userId: challenge.userId,
        action: 'MFA_CHALLENGE_CANCELLED',
        resourceType: 'mfa_challenge',
        resourceId: challenge.id,
        ipAddress: clientIp,
      });
    }
  }

  /**
   * Verify Login MFA Challenge Code (6-digit TOTP).
   * Enforces challenge scope matching. Failed attempt counters commit outside transactions.
   */
  static async verifyChallenge(
    rawChallengeToken: string,
    code: string,
    clientIp: string,
    expectedScope: 'MFA_LOGIN' | 'MFA_ENROLLMENT' = 'MFA_LOGIN'
  ) {
    const challengeTokenHash = hashChallengeToken(rawChallengeToken);

    const targetChallenge = await prisma.mfaChallenge.findUnique({
      where: { challengeTokenHash },
      include: {
        user: { select: { id: true, email: true, isActive: true, deletedAt: true } },
      },
    });

    if (
      !targetChallenge ||
      targetChallenge.expiresAt <= new Date() ||
      targetChallenge.verifiedAt !== null ||
      targetChallenge.revokedAt !== null
    ) {
      throw AppError.badRequest('MFA challenge expired or invalid');
    }

    // Strict Scope Enforcement
    if (targetChallenge.scope !== expectedScope) {
      throw AppError.forbidden(`Invalid MFA challenge scope. Expected ${expectedScope}, got ${targetChallenge.scope}`);
    }

    if (!targetChallenge.user || !targetChallenge.user.isActive || targetChallenge.user.deletedAt !== null) {
      await writeAuditLog({
        userId: targetChallenge.userId,
        action: 'MFA_REQUIRED_BLOCKED',
        resourceType: 'user',
        ipAddress: clientIp,
        newValue: { reason: 'User is inactive or deleted' },
      });
      throw AppError.forbidden('Account is inactive or disabled');
    }

    if (targetChallenge.attemptsCount >= targetChallenge.maxAttempts) {
      await writeAuditLog({
        userId: targetChallenge.userId,
        action: 'MFA_CHALLENGE_LOCKED',
        resourceType: 'mfa_challenge',
        resourceId: targetChallenge.id,
        ipAddress: clientIp,
        newValue: { attemptsCount: targetChallenge.attemptsCount },
      });
      throw AppError.forbidden('MFA challenge locked due to excessive failed attempts');
    }

    const factor = await prisma.mfaFactor.findFirst({
      where: { userId: targetChallenge.userId, status: 'active', disabledAt: null },
    });

    if (!factor) {
      throw AppError.badRequest('No active MFA factor configured for user');
    }

    const plaintextSecret = decryptMfaSecret(factor.secretEncrypted);
    const isValid = authenticator.verify({ token: code, secret: plaintextSecret });

    if (!isValid) {
      // Counter persistence: commit attempt increment immediately outside transaction
      const updatedAttempts = targetChallenge.attemptsCount + 1;
      await prisma.mfaChallenge.update({
        where: { id: targetChallenge.id },
        data: { attemptsCount: updatedAttempts },
      });

      const isLocked = updatedAttempts >= targetChallenge.maxAttempts;
      await writeAuditLog({
        userId: targetChallenge.userId,
        action: isLocked ? 'MFA_CHALLENGE_LOCKED' : 'MFA_CHALLENGE_FAILED',
        resourceType: 'mfa_challenge',
        resourceId: targetChallenge.id,
        ipAddress: clientIp,
        newValue: { attemptsCount: updatedAttempts },
      });

      if (isLocked) {
        throw AppError.forbidden('MFA challenge locked due to excessive failed attempts');
      }
      throw AppError.badRequest('Invalid 6-digit MFA verification code');
    }

    const currentStep = Math.floor(Date.now() / 30000);
    if (factor.lastUsedStep === currentStep) {
      throw AppError.badRequest('MFA code already used. Please wait for the next 6-digit code.');
    }

    // Atomic TOTP step update
    const updatedStepCount = await prisma.$executeRaw`
      UPDATE mfa_factors 
      SET last_used_step = ${currentStep}
      WHERE id = ${factor.id} AND (last_used_step IS NULL OR last_used_step < ${currentStep})
    `;

    if (Number(updatedStepCount) === 0) {
      throw AppError.badRequest('MFA code already used. Please wait for the next 6-digit code.');
    }

    const now = new Date();

    // Mark challenge verified
    await prisma.mfaChallenge.update({
      where: { id: targetChallenge.id },
      data: { verifiedAt: now },
    });

    await writeAuditLog({
      userId: targetChallenge.userId,
      action: 'MFA_CHALLENGE_SUCCESS',
      resourceType: 'mfa_challenge',
      resourceId: targetChallenge.id,
      ipAddress: clientIp,
    });

    return {
      success: true,
      userId: targetChallenge.userId,
    };
  }

  /**
   * Verify Recovery Code
   */
  static async verifyRecoveryCode(userId: string, code: string, clientIp: string) {
    const recoveryCodes = await prisma.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null, revokedAt: null },
    });

    let matchedCodeRecord: (typeof recoveryCodes)[0] | null = null;
    for (const rc of recoveryCodes) {
      if (verifyRecoveryCodeHash(code, rc.codeHash)) {
        matchedCodeRecord = rc;
        break;
      }
    }

    if (!matchedCodeRecord) {
      await writeAuditLog({
        userId,
        action: 'MFA_CHALLENGE_FAILED',
        resourceType: 'mfa_recovery_code',
        ipAddress: clientIp,
        newValue: { type: 'recovery_code_invalid' },
      });
      throw AppError.badRequest('Invalid recovery code');
    }

    await prisma.mfaRecoveryCode.update({
      where: { id: matchedCodeRecord.id },
      data: { usedAt: new Date() },
    });

    await writeAuditLog({
      userId,
      action: 'MFA_RECOVERY_CODE_USED',
      resourceType: 'mfa_recovery_code',
      resourceId: matchedCodeRecord.id,
      ipAddress: clientIp,
    });

    return { success: true };
  }

  /**
   * Regenerate Recovery Codes (Requires recent AAL2)
   */
  static async regenerateRecoveryCodes(userId: string, clientIp: string) {
    const now = new Date();

    // Soft-revoke existing unused recovery codes
    await prisma.mfaRecoveryCode.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });

    const newCodes = generateRecoveryCodes(10);
    await prisma.mfaRecoveryCode.createMany({
      data: newCodes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });

    await writeAuditLog({
      userId,
      action: 'MFA_RECOVERY_CODES_REGENERATED',
      resourceType: 'mfa_recovery_code',
      ipAddress: clientIp,
      newValue: { count: newCodes.length },
    });

    return { recoveryCodes: newCodes };
  }

  /**
   * Disable MFA for User
   * Requires password check + valid current TOTP code or recovery code.
   * Revokes all user sessions and refresh tokens in DB (including current session).
   */
  static async disableMfa(
    userId: string,
    passwordInput: string | undefined,
    codeInput: string | undefined,
    clientIp: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    if (!passwordInput) {
      throw AppError.badRequest('Current password is required to disable MFA');
    }

    const isPasswordValid = await bcrypt.compare(passwordInput, user.passwordHash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Invalid password');
    }

    if (!codeInput) {
      throw AppError.badRequest('Verification code or recovery code is required to disable MFA');
    }

    // Verify code as either TOTP or Recovery Code
    let verified = false;
    const factor = await prisma.mfaFactor.findFirst({
      where: { userId, status: 'active', disabledAt: null },
    });

    if (factor) {
      const plaintextSecret = decryptMfaSecret(factor.secretEncrypted);
      if (authenticator.verify({ token: codeInput, secret: plaintextSecret })) {
        verified = true;
      }
    }

    if (!verified) {
      // Check recovery code
      const recoveryCodes = await prisma.mfaRecoveryCode.findMany({
        where: { userId, usedAt: null, revokedAt: null },
      });
      for (const rc of recoveryCodes) {
        if (verifyRecoveryCodeHash(codeInput, rc.codeHash)) {
          verified = true;
          await prisma.mfaRecoveryCode.update({
            where: { id: rc.id },
            data: { usedAt: new Date() },
          });
          break;
        }
      }
    }

    if (!verified) {
      throw AppError.badRequest('Invalid verification code or recovery code');
    }

    const now = new Date();

    // Soft-disable factors
    await prisma.mfaFactor.updateMany({
      where: { userId, disabledAt: null },
      data: { status: 'disabled', disabledAt: now },
    });

    // Soft-revoke recovery codes
    await prisma.mfaRecoveryCode.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    // Soft-revoke challenges
    await prisma.mfaChallenge.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false },
    });

    // Revoke ALL user sessions and refresh tokens in DB (including current session)
    await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await writeAuditLog({
      userId,
      action: 'MFA_DISABLED',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: clientIp,
    });

    return { success: true };
  }

  /**
   * Admin Reset MFA for Target User.
   * Requires admin role + recent admin AAL2 + mandatory sanitized reason.
   * Revokes target user sessions and refresh tokens.
   */
  static async adminResetMfa(
    adminUserId: string,
    targetUserId: string,
    rawReason: string,
    clientIp: string
  ) {
    if (!rawReason || typeof rawReason !== 'string' || !rawReason.trim()) {
      throw AppError.badRequest('Sanitized reset reason is required');
    }

    // Sanitize reason (strip HTML/control chars, enforce max 255 chars)
    const sanitizedReason = rawReason
      .trim()
      .replace(/<[^>]*>?/gm, '')
      .replace(/[\r\n\t]/g, ' ')
      .substring(0, 255);

    if (sanitizedReason.length < 5) {
      throw AppError.badRequest('Reset reason must be at least 5 characters');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw AppError.notFound('Target User');

    const now = new Date();

    // Soft-disable factors
    await prisma.mfaFactor.updateMany({
      where: { userId: targetUserId, disabledAt: null },
      data: { status: 'disabled', disabledAt: now },
    });

    // Soft-revoke challenges
    await prisma.mfaChallenge.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });

    // Soft-revoke recovery codes
    await prisma.mfaRecoveryCode.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });

    await prisma.user.update({
      where: { id: targetUserId },
      data: { mfaEnabled: false },
    });

    // Revoke target user's active sessions & refresh tokens in DB
    await prisma.session.updateMany({
      where: { userId: targetUserId, isRevoked: false },
      data: { isRevoked: true },
    });

    await prisma.refreshToken.updateMany({
      where: { userId: targetUserId, isRevoked: false },
      data: { isRevoked: true },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'MFA_RESET_BY_ADMIN',
      resourceType: 'user',
      resourceId: targetUserId,
      ipAddress: clientIp,
      newValue: {
        actorId: adminUserId,
        targetId: targetUserId,
        reason: sanitizedReason,
      },
    });

    return { success: true };
  }

  /**
   * Look up a userId from an MFA challenge token by checking its HMAC hash.
   * Validates expiration, revocation, and optional scope.
   */
  static async getUserIdFromChallengeToken(
    rawChallengeToken: string,
    expectedScope?: string
  ): Promise<string | null> {
    const challengeTokenHash = hashChallengeToken(rawChallengeToken);

    const challenge = await prisma.mfaChallenge.findUnique({
      where: { challengeTokenHash },
      select: {
        userId: true,
        expiresAt: true,
        verifiedAt: true,
        revokedAt: true,
        scope: true,
      },
    });

    if (
      !challenge ||
      challenge.expiresAt <= new Date() ||
      challenge.verifiedAt !== null ||
      challenge.revokedAt !== null
    ) {
      return null;
    }

    if (expectedScope && challenge.scope !== expectedScope) {
      return null;
    }

    return challenge.userId;
  }
}
