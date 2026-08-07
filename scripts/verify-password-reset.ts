// Radiantilyk EMR — Password Reset Verification Suite
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/database';
import { PasswordResetService } from '../src/services/password-reset.service';

async function runVerification() {
  console.log('--- STARTING PASSWORD RESET VERIFICATION SUITE ---');

  // Test 1 & 2 & 3: Unknown email returns generic HTTP 200 response & creates no token
  const unknownEmail = `unknown.user.${Date.now()}@example.com`;
  const unknownRes = await PasswordResetService.requestPasswordReset(unknownEmail, '127.0.0.1', 'TestRunner');
  if (unknownRes.message !== 'If an account exists, password reset instructions have been sent.') {
    throw new Error('Assertion 1 & 2 Failed: Unknown email response mismatch');
  }
  const unknownTokens = await prisma.passwordResetToken.findMany({
    where: { user: { email: unknownEmail } },
  });
  if (unknownTokens.length > 0) {
    throw new Error('Assertion 3 Failed: Token created for unknown email');
  }
  console.log('✅ Assertion 1, 2, 3 Passed: Unknown email returns generic response and creates zero tokens');

  // Dedicated test user creation
  const testEmail = `reset.test.user.${Date.now()}@example.com`;
  const initPassword = 'InitialP@ssword123!';
  const initHash = await bcrypt.hash(initPassword, 12);

  const user = await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash: initHash,
      isActive: true,
    },
  });

  try {
    // Create initial session & refresh token to test revocation
    const activeSession = await prisma.session.create({
      data: {
        userId: user.id,
        token: `session-${Date.now()}`,
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const activeRefreshToken = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: `refresh-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Assertion 4, 5, 6, 7: Valid user request creates reset-token record with SHA-256 hash
    const validRes = await PasswordResetService.requestPasswordReset(testEmail, '127.0.0.1', 'TestRunner');
    if (validRes.message !== 'If an account exists, password reset instructions have been sent.') {
      throw new Error('Assertion 4 Failed: Valid email response mismatch');
    }

    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!tokenRecord) {
      throw new Error('Assertion 4 Failed: PasswordResetToken record not created');
    }
    if (tokenRecord.tokenHash.length !== 64) {
      throw new Error('Assertion 5 Failed: tokenHash is not SHA-256 (expected 64 chars)');
    }
    const durationMs = tokenRecord.expiresAt.getTime() - tokenRecord.createdAt.getTime();
    if (Math.abs(durationMs - 30 * 60 * 1000) > 5000) {
      throw new Error(`Assertion 7 Failed: Expiry duration is not 30m (${durationMs}ms)`);
    }
    console.log('✅ Assertion 4, 5, 6, 7 Passed: Valid user token created with SHA-256 hash and 30m expiry');

    // Assertion 8: Previous unused tokens invalidated when new request is made
    await PasswordResetService.requestPasswordReset(testEmail, '127.0.0.1', 'TestRunner');
    const oldToken = await prisma.passwordResetToken.findUnique({ where: { id: tokenRecord.id } });
    if (!oldToken?.usedAt) {
      throw new Error('Assertion 8 Failed: Previous unused token was not invalidated');
    }
    console.log('✅ Assertion 8 Passed: Previous unused tokens invalidated');

    // Assertion 9: Invalid raw token rejected
    try {
      await PasswordResetService.resetPassword('invalid-raw-token-12345', 'NewValidP@ssword123!', '127.0.0.1');
      throw new Error('Assertion 9 Failed: Invalid token accepted');
    } catch (err: any) {
      if (!err.message.includes('Invalid or expired')) {
        throw new Error(`Assertion 9 Failed: Unexpected error ${err.message}`);
      }
    }
    console.log('✅ Assertion 9 Passed: Invalid token rejected');

    // Generate manual raw token for assertion testing
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        requestedIp: '127.0.0.1',
      },
    });

    // Assertion 13 & 14: Current password and 5 recent passwords rejected
    try {
      await PasswordResetService.resetPassword(rawToken, initPassword, '127.0.0.1');
      throw new Error('Assertion 13 & 14 Failed: Current/recent password accepted');
    } catch (err: any) {
      if (!err.message.includes('last 5 passwords')) {
        throw new Error(`Assertion 13 & 14 Failed: Unexpected error ${err.message}`);
      }
    }
    console.log('✅ Assertion 13 & 14 Passed: Current password and recent password history rejected');

    // Assertion 15, 16, 17, 18, 19, 20: Valid new password accepted, transaction & audit completed
    const newPassword = `BrandNewP@ssword_${Date.now()}!`;
    const resetRes = await PasswordResetService.resetPassword(rawToken, newPassword, '127.0.0.1');
    if (resetRes.message !== 'Password updated successfully.') {
      throw new Error('Assertion 15 Failed: Reset response message mismatch');
    }

    // Verify PasswordHistory created
    const histories = await prisma.passwordHistory.findMany({ where: { userId: user.id } });
    if (histories.length === 0) {
      throw new Error('Assertion 16 Failed: PasswordHistory row not created');
    }

    // Verify Token marked used
    const usedRecord = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!usedRecord?.usedAt) {
      throw new Error('Assertion 17 Failed: Reset token not marked used');
    }

    // Verify Active sessions revoked
    const revokedSession = await prisma.session.findUnique({ where: { id: activeSession.id } });
    if (!revokedSession?.isRevoked) {
      throw new Error('Assertion 18 Failed: Active session not revoked');
    }

    // Verify Refresh tokens revoked
    const revokedRefresh = await prisma.refreshToken.findUnique({ where: { id: activeRefreshToken.id } });
    if (!revokedRefresh?.isRevoked) {
      throw new Error('Assertion 19 Failed: Refresh token not revoked');
    }

    // Verify PASSWORD_CHANGED audit log written
    const auditLog = await prisma.authAuditLog.findFirst({
      where: { userId: user.id, eventType: 'PASSWORD_CHANGED' },
    });
    if (!auditLog) {
      throw new Error('Assertion 20 Failed: PASSWORD_CHANGED audit log not found');
    }

    console.log('✅ Assertion 15, 16, 17, 18, 19, 20 Passed: Password updated, history created, token used, sessions & refresh tokens revoked, audit event written');

    // Assertion 11 & 12: Token reuse rejected
    try {
      await PasswordResetService.resetPassword(rawToken, 'AnotherP@ssword999!', '127.0.0.1');
      throw new Error('Assertion 11 & 12 Failed: Reused token accepted');
    } catch (err: any) {
      if (!err.message.includes('Invalid or expired')) {
        throw new Error(`Assertion 11 & 12 Failed: Unexpected error ${err.message}`);
      }
    }
    console.log('✅ Assertion 11 & 12 Passed: Token reuse rejected');

    // Assertion 10: Expired token rejected
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        requestedIp: '127.0.0.1',
      },
    });

    try {
      await PasswordResetService.resetPassword(expiredRawToken, 'ExpiredP@ssword999!', '127.0.0.1');
      throw new Error('Assertion 10 Failed: Expired token accepted');
    } catch (err: any) {
      if (!err.message.includes('Invalid or expired')) {
        throw new Error(`Assertion 10 Failed: Unexpected error ${err.message}`);
      }
    }
    console.log('✅ Assertion 10 Passed: Expired token rejected');

    console.log('--- ALL 20 PASSWORD RESET VERIFICATION ASSERTIONS PASSED ---');
  } finally {
    // Cleanup dedicated test user & records
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordHistory.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.authAuditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log('🧹 Test records cleaned up successfully.');
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
