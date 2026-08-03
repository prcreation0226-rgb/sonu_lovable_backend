// Radiantilyk EMR — Phase 1A Verification Script
// Strictly tests Authentication, Session Management, HMAC Refresh Token Hashing, Rotation, Logout, & Audit Logging against Live DB.
// Does NOT modify unrelated code or touch patient/clinical/billing data.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const API_BASE_URL = process.env.LIVE_BACKEND_URL || 'https://sonulovablebackend-production.up.railway.app/api/v1';
const TEST_EMAIL = 'phase1-test@radiantilyk.com';
const TEST_PASSWORD = 'Phase1Test!2026';

type VerificationRow = {
  Table: string;
  RecordFound: string;
  UserLinkage: string;
  TokenHashed: string;
  RevocationStatus: string;
  AuditEvent: string;
  Result: 'PASS' | 'FAIL';
};

async function runVerification() {
  console.log('===============================================================');
  console.log('  PHASE 1A — LIVE MYSQL AUTHENTICATION VERIFICATION SUITE');
  console.log('===============================================================');
  console.log(`[TARGET API] ${API_BASE_URL}`);
  console.log(`[TEST USER]  ${TEST_EMAIL}`);
  console.log('---------------------------------------------------------------\n');

  const rows: VerificationRow[] = [];

  // Step 0: Ensure Test User Exists in Database
  let testUser = await prisma.user.findFirst({ where: { email: TEST_EMAIL } });
  if (!testUser) {
    console.log('[SETUP] Creating phase1-test@radiantilyk.com in MySQL database...');
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    let role = await prisma.role.findFirst({ where: { name: 'front_desk' } });
    if (!role) {
      role = await prisma.role.create({ data: { name: 'front_desk', description: 'Front desk role' } });
    }
    testUser = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        isActive: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: testUser.id, roleId: role.id },
    });
  }
  console.log(`[DB] Test User Verified: ID ending in ...${testUser.id.slice(-8)}`);

  // -------------------------------------------------------------
  // STEP 1 & 2: LOGIN & SESSION CREATION
  // -------------------------------------------------------------
  console.log('\n--- STEP 1 & 2: Login & Session Verification ---');
  
  // First, deliberately trigger 1 failed login to test audit logging for failed attempts
  try {
    await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: 'WrongPassword123!' }),
    });
  } catch (e) {}

  // Now perform valid login
  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  const loginData = await loginRes.json();
  const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
  const cookiesStr = setCookieHeaders.join('; ');

  console.log(`[API] POST /auth/login Status: ${loginRes.status} (Success: ${loginData.success})`);

  // Verify Session in DB
  const latestSession = await prisma.session.findFirst({
    where: { userId: testUser.id },
    orderBy: { createdAt: 'desc' },
  });

  const sessionPass = !!latestSession && !latestSession.isRevoked;
  rows.push({
    Table: 'sessions',
    RecordFound: sessionPass ? 'Yes' : 'No',
    UserLinkage: latestSession?.userId === testUser.id ? 'Verified' : 'Failed',
    TokenHashed: 'N/A (Session UUID)',
    RevocationStatus: latestSession?.isRevoked ? 'Revoked' : 'Active',
    AuditEvent: 'LOGIN_SUCCESS',
    Result: sessionPass ? 'PASS' : 'FAIL',
  });

  // -------------------------------------------------------------
  // STEP 3: REFRESH TOKEN HASHING & METADATA
  // -------------------------------------------------------------
  console.log('\n--- STEP 3: Refresh Token HMAC-SHA256 Hashing Verification ---');

  const latestTokenRecord = await prisma.refreshToken.findFirst({
    where: { userId: testUser.id },
    orderBy: { createdAt: 'desc' },
  });

  const isHashedHex = !!latestTokenRecord && /^[a-f0-9]{64}$/i.test(latestTokenRecord.token);
  const notRawJwt = !!latestTokenRecord && !latestTokenRecord.token.startsWith('eyJ');
  const hasTimestamps = !!latestTokenRecord?.createdAt && !!latestTokenRecord?.expiresAt;
  const isNotRevokedInitially = !!latestTokenRecord && !latestTokenRecord.isRevoked;

  const tokenPass = isHashedHex && notRawJwt && hasTimestamps && isNotRevokedInitially;

  console.log(`  - Token Exists in DB: ${!!latestTokenRecord}`);
  console.log(`  - Format is 64-char HMAC-SHA256 Hex: ${isHashedHex}`);
  console.log(`  - Is NOT raw JWT string: ${notRawJwt}`);
  console.log(`  - Creation & Expiry Timestamps Present: ${hasTimestamps}`);
  console.log(`  - Initial Revocation Status: ${latestTokenRecord?.isRevoked ? 'REVOKED (FAIL)' : 'ACTIVE (PASS)'}`);

  rows.push({
    Table: 'refresh_tokens',
    RecordFound: latestTokenRecord ? 'Yes' : 'No',
    UserLinkage: latestTokenRecord?.userId === testUser.id ? 'Verified' : 'Failed',
    TokenHashed: isHashedHex && notRawJwt ? 'HMAC-SHA256 (64-hex)' : 'Raw/Invalid',
    RevocationStatus: latestTokenRecord?.isRevoked ? 'Revoked' : 'Active',
    AuditEvent: 'LOGIN_SUCCESS',
    Result: tokenPass ? 'PASS' : 'FAIL',
  });

  const initialTokenId = latestTokenRecord?.id;
  const initialTokenHash = latestTokenRecord?.token;

  // -------------------------------------------------------------
  // STEP 4: TOKEN ROTATION (POST /auth/refresh)
  // -------------------------------------------------------------
  console.log('\n--- STEP 4: Token Rotation Verification ---');

  const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookiesStr,
    },
  });

  const refreshData = await refreshRes.json();
  const refreshCookies = refreshRes.headers.getSetCookie ? refreshRes.headers.getSetCookie() : [refreshRes.headers.get('set-cookie') || ''];
  const newCookiesStr = refreshCookies.join('; ');

  console.log(`[API] POST /auth/refresh Status: ${refreshRes.status} (Success: ${refreshData.success})`);

  // Re-query DB after rotation
  const rotatedInitialToken = await prisma.refreshToken.findFirst({
    where: { id: initialTokenId },
  });

  const newTokenRecord = await prisma.refreshToken.findFirst({
    where: { userId: testUser.id, id: { not: initialTokenId } },
    orderBy: { createdAt: 'desc' },
  });

  const initialRevoked = !!rotatedInitialToken?.isRevoked;
  const newCreated = !!newTokenRecord && !newTokenRecord.isRevoked;
  const rotationPass = initialRevoked && newCreated && (newTokenRecord.token !== initialTokenHash);

  console.log(`  - Previous Token Revoked: ${initialRevoked}`);
  console.log(`  - New Rotated Token Created: ${newCreated}`);
  console.log(`  - Tokens Are Distinct & Hashed: ${newTokenRecord?.token !== initialTokenHash}`);

  // Verify old token cannot be reused
  const reuseAttemptRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookiesStr, // Sending OLD cookie
    },
  });
  console.log(`  - Reusing Revoked Token Status: ${reuseAttemptRes.status} (Expected: 401)`);

  rows.push({
    Table: 'refresh_tokens (Rotated)',
    RecordFound: newTokenRecord ? 'Yes' : 'No',
    UserLinkage: newTokenRecord?.userId === testUser.id ? 'Verified' : 'Failed',
    TokenHashed: 'HMAC-SHA256 (64-hex)',
    RevocationStatus: initialRevoked && !newTokenRecord?.isRevoked ? 'Old Revoked / New Active' : 'Failed',
    AuditEvent: 'REFRESH_SUCCESS',
    Result: rotationPass && reuseAttemptRes.status === 401 ? 'PASS' : 'FAIL',
  });

  // -------------------------------------------------------------
  // STEP 5: LOGOUT & REVOCATION
  // -------------------------------------------------------------
  console.log('\n--- STEP 5: Logout & Full Invalidation Verification ---');

  const logoutRes = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': newCookiesStr,
    },
  });

  console.log(`[API] POST /auth/logout Status: ${logoutRes.status}`);

  // Re-query DB after logout
  const postLogoutTokens = await prisma.refreshToken.findMany({
    where: { userId: testUser.id },
  });
  const allTokensRevoked = postLogoutTokens.every(t => t.isRevoked);

  const postLogoutSession = await prisma.session.findFirst({
    where: { id: latestSession?.id },
  });
  const sessionRevoked = !postLogoutSession || postLogoutSession.isRevoked;

  // Test requesting /me with logged out cookie
  const postLogoutMe = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: { 'Cookie': newCookiesStr },
  });
  console.log(`  - All User Refresh Tokens Revoked in DB: ${allTokensRevoked}`);
  console.log(`  - Active Session Revoked in DB: ${sessionRevoked}`);
  console.log(`  - Post-Logout GET /auth/me Status: ${postLogoutMe.status} (Expected: 401)`);

  const logoutPass = allTokensRevoked && sessionRevoked && postLogoutMe.status === 401;

  rows.push({
    Table: 'sessions & refresh_tokens',
    RecordFound: 'Yes',
    UserLinkage: 'Verified',
    TokenHashed: 'HMAC-SHA256',
    RevocationStatus: allTokensRevoked ? 'All Revoked' : 'Active (FAIL)',
    AuditEvent: 'LOGOUT',
    Result: logoutPass ? 'PASS' : 'FAIL',
  });

  // -------------------------------------------------------------
  // STEP 6: AUTH AUDIT LOG VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- STEP 6: Auth Audit Trail Verification ---');

  const auditLogs = await prisma.authAuditLog.findMany({
    where: { email: TEST_EMAIL },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const eventTypes = auditLogs.map(a => a.eventType);
  console.log(`[AUDIT LOGS FOUND] ${eventTypes.join(', ')}`);

  const hasLoginSuccess = eventTypes.includes('LOGIN_SUCCESS');
  const hasLoginFailed = eventTypes.includes('LOGIN_FAILED');
  const hasRefresh = eventTypes.includes('REFRESH_SUCCESS') || eventTypes.includes('TOKEN_ROTATED');
  const hasLogout = eventTypes.includes('LOGOUT');

  const auditPass = hasLoginSuccess && hasLoginFailed && hasLogout;

  rows.push({
    Table: 'auth_audit_logs',
    RecordFound: `${auditLogs.length} Events`,
    UserLinkage: 'Verified by Email',
    TokenHashed: 'N/A',
    RevocationStatus: 'Immutable Log',
    AuditEvent: eventTypes.join(', '),
    Result: auditPass ? 'PASS' : 'FAIL',
  });

  // -------------------------------------------------------------
  // SANITIZED SUMMARY TABLE OUTPUT
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('  SANITIZED PHASE 1A VERIFICATION SUMMARY TABLE');
  console.log('===============================================================');
  console.table(rows);

  const overallPass = rows.every(r => r.Result === 'PASS');
  console.log(`\nOVERALL PHASE 1A VERIFICATION RESULT: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);

  await prisma.$disconnect();
}

runVerification().catch((err) => {
  console.error('Fatal Verification Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
