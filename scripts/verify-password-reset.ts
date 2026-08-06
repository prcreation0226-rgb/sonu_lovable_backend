// Radiantilyk EMR — Password Reset Verification Suite
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/config/database';
import { PasswordResetService } from '../src/services/password-reset.service';

async function runVerification() {
  console.log('--- STARTING PASSWORD RESET VERIFICATION SUITE ---');

  // Test 1: Unknown email returns generic response
  const unknownRes = await PasswordResetService.requestPasswordReset('nonexistent.user999@example.com', '127.0.0.1', 'TestRunner');
  if (unknownRes.message !== 'If an account exists, password reset instructions have been sent.') {
    throw new Error('Test 1 Failed: Unknown email response mismatch');
  }
  console.log('✅ Test 1 Passed: Unknown email returns generic response');

  // Find or create a test user
  const testEmail = 'reset.test.user@example.com';
  let user = await prisma.user.findFirst({ where: { email: testEmail } });
  const initPassword = 'InitialP@ssword123!';
  const initHash = await bcrypt.hash(initPassword, 12);

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: initHash,
        isActive: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: initHash, failedAttempts: 0, lockedUntil: null },
    });
  }

  // Create an active session to test revocation
  const activeSession = await prisma.session.create({
    data: {
      userId: user.id,
      token: `session-${Date.now()}`,
      ipAddress: '127.0.0.1',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Test 2: Request reset for valid user
  const validRes = await PasswordResetService.requestPasswordReset(testEmail, '127.0.0.1', 'TestRunner');
  if (validRes.message !== 'If an account exists, password reset instructions have been sent.') {
    throw new Error('Test 2 Failed: Valid email response mismatch');
  }

  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!tokenRecord) {
    throw new Error('Test 2 Failed: PasswordResetToken not created in database');
  }
  console.log('✅ Test 2 Passed: Password reset requested and token stored');

  // Test 3: Password history rejection (reject initial password)
  try {
    await PasswordResetService.resetPassword('fake-raw-token', initPassword, '127.0.0.1');
    throw new Error('Test 3 Failed: Should have rejected invalid token');
  } catch (err: any) {
    if (!err.message.includes('Invalid or expired')) {
      throw new Error(`Test 3 Failed: Unexpected error ${err.message}`);
    }
  }
  console.log('✅ Test 3 Passed: Invalid raw token rejected safely');

  // Generate manual raw token & tokenHash for controlled tests
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

  // Test 4: Password history rejection with valid token
  try {
    await PasswordResetService.resetPassword(rawToken, initPassword, '127.0.0.1');
    throw new Error('Test 4 Failed: Should have rejected password history match');
  } catch (err: any) {
    if (!err.message.includes('last 5 passwords')) {
      throw new Error(`Test 4 Failed: Unexpected error ${err.message}`);
    }
  }
  console.log('✅ Test 4 Passed: 5-password history rule enforced');

  // Test 5: Successful reset with new password
  const newPassword = 'BrandNewP@ssword2026!';
  const resetRes = await PasswordResetService.resetPassword(rawToken, newPassword, '127.0.0.1');
  if (resetRes.message !== 'Password updated successfully.') {
    throw new Error('Test 5 Failed: Reset success message mismatch');
  }

  // Verify session revocation
  const revokedSession = await prisma.session.findUnique({ where: { id: activeSession.id } });
  if (!revokedSession?.isRevoked) {
    throw new Error('Test 5 Failed: Active session was not revoked');
  }

  // Verify token marked used
  const usedToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!usedToken?.usedAt) {
    throw new Error('Test 5 Failed: Token was not marked used');
  }
  console.log('✅ Test 5 Passed: Password reset succeeded, token marked used, sessions revoked');

  // Test 6: Reuse of used token rejected
  try {
    await PasswordResetService.resetPassword(rawToken, 'AnotherP@ssword999!', '127.0.0.1');
    throw new Error('Test 6 Failed: Reused token was accepted');
  } catch (err: any) {
    if (!err.message.includes('Invalid or expired')) {
      throw new Error(`Test 6 Failed: Unexpected error ${err.message}`);
    }
  }
  console.log('✅ Test 6 Passed: Token reuse rejected');

  // Test 7: Expired token rejected
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
    throw new Error('Test 7 Failed: Expired token was accepted');
  } catch (err: any) {
    if (!err.message.includes('Invalid or expired')) {
      throw new Error(`Test 7 Failed: Unexpected error ${err.message}`);
    }
  }
  console.log('✅ Test 7 Passed: Expired token rejected');

  console.log('--- ALL PASSWORD RESET VERIFICATION TESTS PASSED ---');
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
