import { authenticator } from 'otplib';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import {
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
  generateChallengeToken,
} from '../utils/mfaCrypto';
import { writeAuditLog } from '../middleware/audit';

// Configure authenticator options
authenticator.options = {
  window: 1, // Allow 1 step (30s) drift before/after
};

export class MfaService {
  /**
   * Idempotently ensure MFA tables and columns exist in MySQL.
   */
  static async ensureMfaTablesExist(): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS mfa_factors (
          id CHAR(36) NOT NULL PRIMARY KEY,
          user_id CHAR(36) NOT NULL,
          factor_type VARCHAR(20) NOT NULL DEFAULT 'totp',
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          secret_encrypted VARCHAR(500) NOT NULL,
          otpauth_url TEXT,
          last_used_step INT,
          verified_at DATETIME(3),
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          INDEX idx_user_status (user_id, status),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS mfa_challenges (
          id CHAR(36) NOT NULL PRIMARY KEY,
          user_id CHAR(36) NOT NULL,
          factor_id CHAR(36),
          challenge_token_encrypted VARCHAR(500) NOT NULL UNIQUE,
          attempts_count INT NOT NULL DEFAULT 0,
          max_attempts INT NOT NULL DEFAULT 5,
          expires_at DATETIME(3) NOT NULL,
          verified_at DATETIME(3),
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_user_expires (user_id, expires_at),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (factor_id) REFERENCES mfa_factors(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Check and add aal column to sessions
      const sessionAalExists = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'aal';`
      );
      if (!sessionAalExists || sessionAalExists.length === 0) {
        await prisma.$executeRawUnsafe(`ALTER TABLE sessions ADD COLUMN aal VARCHAR(10) NOT NULL DEFAULT 'aal1';`);
      }

      // Check and add aal column to refresh_tokens
      const refreshAalExists = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'aal';`
      );
      if (!refreshAalExists || refreshAalExists.length === 0) {
        await prisma.$executeRawUnsafe(`ALTER TABLE refresh_tokens ADD COLUMN aal VARCHAR(10) NOT NULL DEFAULT 'aal1';`);
      }
    } catch (error) {
      console.warn('[MFA SCHEMA BOOTSTRAP] Non-fatal schema initialization note:', error);
    }
  }

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
      where: { userId, status: 'active' },
      select: { id: true, factorType: true, status: true, verifiedAt: true, createdAt: true },
    });

    const recoveryCodesCount = await prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
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

    // Clean up existing pending factors
    await prisma.mfaFactor.deleteMany({
      where: { userId, status: 'pending' },
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
      where: { id: factorId, userId },
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

    const now = new Date();

    // Activate factor
    await prisma.mfaFactor.update({
      where: { id: factor.id },
      data: {
        status: 'active',
        verifiedAt: now,
        lastUsedStep: currentStep,
      },
    });

    // Mark user MFA enabled
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    // Delete previous recovery codes if any
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });

    // Generate 10 new recovery codes
    const recoveryCodes = generateRecoveryCodes(10);
    await prisma.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(code),
      })),
    });

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
   * Create Login MFA Challenge
   */
  static async createChallenge(userId: string, factorId?: string) {
    const challengeToken = generateChallengeToken();
    const challengeTokenEncrypted = encryptMfaSecret(challengeToken);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const challenge = await prisma.mfaChallenge.create({
      data: {
        userId,
        factorId: factorId || null,
        challengeTokenEncrypted,
        attemptsCount: 0,
        maxAttempts: 5,
        expiresAt,
      },
    });

    return {
      challengeToken,
      challengeId: challenge.id,
      expiresAt,
    };
  }

  /**
   * Verify Login MFA Challenge Code (6-digit TOTP)
   */
  static async verifyChallenge(challengeToken: string, code: string, clientIp: string) {
    const challenges = await prisma.mfaChallenge.findMany({
      where: {
        expiresAt: { gt: new Date() },
        verifiedAt: null,
      },
      include: {
        user: { select: { id: true, email: true, isActive: true, deletedAt: true } },
      },
    });

    let targetChallenge: (typeof challenges)[0] | null = null;
    for (const ch of challenges) {
      try {
        const decryptedToken = decryptMfaSecret(ch.challengeTokenEncrypted);
        if (decryptedToken === challengeToken) {
          targetChallenge = ch;
          break;
        }
      } catch (e) {
        // Skip non-matching decryption
      }
    }

    if (!targetChallenge) {
      throw AppError.badRequest('MFA challenge expired or invalid');
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
      where: { userId: targetChallenge.userId, status: 'active' },
    });

    if (!factor) {
      throw AppError.badRequest('No active MFA factor configured for user');
    }

    const plaintextSecret = decryptMfaSecret(factor.secretEncrypted);
    const isValid = authenticator.verify({ token: code, secret: plaintextSecret });

    if (!isValid) {
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

    const now = new Date();
    // Mark challenge verified & update factor lastUsedStep
    await prisma.mfaChallenge.update({
      where: { id: targetChallenge.id },
      data: { verifiedAt: now },
    });

    await prisma.mfaFactor.update({
      where: { id: factor.id },
      data: { lastUsedStep: currentStep },
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
      where: { userId, usedAt: null },
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
   * Regenerate Recovery Codes
   */
  static async regenerateRecoveryCodes(userId: string, clientIp: string) {
    await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });

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
   */
  static async disableMfa(userId: string, clientIp: string) {
    await prisma.mfaFactor.updateMany({
      where: { userId },
      data: { status: 'disabled' },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false },
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
   * Admin Reset MFA for Target User
   */
  static async adminResetMfa(adminUserId: string, targetUserId: string, clientIp: string) {
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw AppError.notFound('Target User');

    await prisma.mfaFactor.updateMany({
      where: { userId: targetUserId },
      data: { status: 'disabled' },
    });

    await prisma.mfaChallenge.deleteMany({
      where: { userId: targetUserId },
    });

    await prisma.mfaRecoveryCode.deleteMany({
      where: { userId: targetUserId },
    });

    await prisma.user.update({
      where: { id: targetUserId },
      data: { mfaEnabled: false },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'MFA_RESET_BY_ADMIN',
      resourceType: 'user',
      resourceId: targetUserId,
      ipAddress: clientIp,
    });

    return { success: true };
  }
}
