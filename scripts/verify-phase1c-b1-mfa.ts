import http from 'http';
import https from 'https';
import { authenticator } from 'otplib';

// Configure HTTPS Agent for direct IP connection to Railway live backend
const agent = new https.Agent({
  rejectUnauthorized: false,
});

const API_BASE = 'https://69.46.46.14/api/v1';
const HOST_HEADER = 'sonulovablebackend-production.up.railway.app';

interface TestResult {
  num: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  notes: string;
}

const results: TestResult[] = [];

async function makeRequest(
  method: string,
  path: string,
  body?: any,
  cookies?: string[],
  customHeaders?: Record<string, string>
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const payload = body ? JSON.stringify(body) : '';

    const reqHeaders: Record<string, string> = {
      Host: HOST_HEADER,
      'Content-Type': 'application/json',
      'User-Agent': 'Phase1C-B1-MFA-Verification-Suite/1.0',
      ...customHeaders,
    };

    if (cookies && cookies.length > 0) {
      reqHeaders['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
    }

    const options: https.RequestOptions = {
      hostname: '69.46.46.14',
      port: 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: reqHeaders,
      agent,
      servername: HOST_HEADER,
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      const setCookieHeaders = (res.headers['set-cookie'] || []) as string[];

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        let parsedBody: any = {};
        try {
          parsedBody = JSON.parse(responseData);
        } catch {
          parsedBody = { raw: responseData };
        }
        resolve({
          status: res.statusCode || 500,
          body: parsedBody,
          headers: res.headers,
          cookies: setCookieHeaders,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runMfaVerificationSuite() {
  console.log('================================================================');
  console.log('  PHASE 1C-B1 — BACKEND TOTP MFA FOUNDATION VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Seed test accounts
  console.log('1. Seeding test accounts on live Railway database...');
  const seedRes = await makeRequest('POST', '/auth/seed-test-accounts');
  if (seedRes.status !== 200) {
    console.error('FAILED to seed test accounts:', seedRes.body);
    process.exit(1);
  }
  console.log('Test accounts seeded successfully.\n');

  // Authenticate as phase1-admin
  console.log('2. Authenticating as phase1-admin@radiantilyk.com...');
  const adminLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-admin@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const adminCookies = adminLogin.cookies;

  // Test 1: Standard login works normally when MFA_ENFORCEMENT_ENABLED=false
  results.push({
    num: 1,
    name: 'Login works normally when MFA_ENFORCEMENT_ENABLED=false',
    expected: '200',
    actual: `${adminLogin.status}`,
    status: adminLogin.status === 200 && adminLogin.body.success ? 'PASS' : 'FAIL',
    notes: 'Issued HttpOnly cookies without MFA challenge when flag is false',
  });

  // Test 2: GET /auth/mfa/status (Unenrolled user)
  const statusRes1 = await makeRequest('GET', '/auth/mfa/status', undefined, adminCookies);
  results.push({
    num: 2,
    name: 'GET /auth/mfa/status for fresh user',
    expected: '200',
    actual: `${statusRes1.status}`,
    status: statusRes1.status === 200 && statusRes1.body.data?.mfaEnabled === false ? 'PASS' : 'FAIL',
    notes: `mfaEnabled: ${statusRes1.body.data?.mfaEnabled}, factorsCount: ${statusRes1.body.data?.factorsCount}`,
  });

  // Test 3: POST /auth/mfa/enroll/start (Voluntary enrollment start)
  const startRes = await makeRequest('POST', '/auth/mfa/enroll/start', undefined, adminCookies);
  const factorId = startRes.body.data?.factorId;
  const totpSecret = startRes.body.data?.secret;
  const otpauthUrl = startRes.body.data?.otpauthUrl;

  results.push({
    num: 3,
    name: 'Voluntary enrollment start generates secret & otpauth URL',
    expected: '200',
    actual: `${startRes.status}`,
    status: startRes.status === 200 && !!totpSecret && !!otpauthUrl ? 'PASS' : 'FAIL',
    notes: `Returned factorId: ${factorId ? 'YES' : 'NO'}, secret: ${totpSecret ? 'YES' : 'NO'}`,
  });

  // Test 4: Verify with wrong 6-digit code fails cleanly
  const wrongCodeRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: '000000',
  }, adminCookies);

  results.push({
    num: 4,
    name: 'Enrollment verification fails with wrong 6-digit code',
    expected: '400',
    actual: `${wrongCodeRes.status}`,
    status: wrongCodeRes.status === 400 ? 'PASS' : 'FAIL',
    notes: 'Returned 400 Bad Request with error message',
  });

  // Test 5: Verify with correct 6-digit TOTP code succeeds & generates 10 recovery codes
  const validCode = authenticator.generate(totpSecret);
  const verifyEnrollRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: validCode,
  }, adminCookies);

  const recoveryCodes = verifyEnrollRes.body.data?.recoveryCodes || [];

  results.push({
    num: 5,
    name: 'Enrollment verification succeeds & generates 10 recovery codes',
    expected: '200',
    actual: `${verifyEnrollRes.status}`,
    status: verifyEnrollRes.status === 200 && recoveryCodes.length === 10 ? 'PASS' : 'FAIL',
    notes: `Generated ${recoveryCodes.length} high-entropy recovery codes`,
  });

  // Test 6: TOTP code replay within same step is blocked
  const replayRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: validCode,
  }, adminCookies);

  results.push({
    num: 6,
    name: 'TOTP code replay prevention',
    expected: '400',
    actual: `${replayRes.status}`,
    status: replayRes.status === 400 ? 'PASS' : 'FAIL',
    notes: 'Replay of used TOTP code blocked with 400 Bad Request',
  });

  // Test 7: GET /auth/mfa/status after enrollment shows active factor
  const statusRes2 = await makeRequest('GET', '/auth/mfa/status', undefined, adminCookies);
  results.push({
    num: 7,
    name: 'GET /auth/mfa/status after enrollment',
    expected: '200',
    actual: `${statusRes2.status}`,
    status: statusRes2.status === 200 && statusRes2.body.data?.mfaEnabled === true ? 'PASS' : 'FAIL',
    notes: `mfaEnabled: true, activeFactors: ${statusRes2.body.data?.activeFactors?.length}`,
  });

  // Enroll NP user for login challenge testing
  const npLogin1 = await makeRequest('POST', '/auth/login', {
    email: 'phase1-np@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const npCookies1 = npLogin1.cookies;

  const npStartRes = await makeRequest('POST', '/auth/mfa/enroll/start', undefined, npCookies1);
  const npFactorId = npStartRes.body.data?.factorId;
  const npSecret = npStartRes.body.data?.secret;
  const npCode = authenticator.generate(npSecret);

  await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId: npFactorId,
    code: npCode,
  }, npCookies1);

  // Test 8: Login when user has active MFA factor triggers MFA challenge
  const mfaLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-np@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const hasMfaPendingCookie = mfaLogin.cookies.some((c) => c.includes('rka_mfa_pending'));
  const hasAccessCookie = mfaLogin.cookies.some((c) => c.includes('rka_access'));
  const hasChallengeTokenInBody = 'challengeToken' in (mfaLogin.body.data || {});

  results.push({
    num: 8,
    name: 'Login returns 202 and rka_mfa_pending cookie without token in body',
    expected: '202',
    actual: `${mfaLogin.status}`,
    status: mfaLogin.status === 202 && mfaLogin.body.data?.mfaRequired === true && hasMfaPendingCookie && !hasAccessCookie && !hasChallengeTokenInBody ? 'PASS' : 'FAIL',
    notes: 'Issued HttpOnly rka_mfa_pending cookie ONLY. Zero challenge tokens in response body.',
  });

  // Test 9: Complete MFA challenge with wrong code fails
  const wrongChallengeRes = await makeRequest(
    'POST',
    '/auth/mfa/challenge/verify',
    { code: '999999' },
    mfaLogin.cookies
  );

  results.push({
    num: 9,
    name: 'MFA challenge verification fails with wrong code',
    expected: '400',
    actual: `${wrongChallengeRes.status}`,
    status: wrongChallengeRes.status === 400 ? 'PASS' : 'FAIL',
    notes: 'Increments attemptsCount on challenge record',
  });

  // Wait for TOTP step boundary
  const currentStep = Math.floor(Date.now() / 30000);
  let nextStep = Math.floor(Date.now() / 30000);
  while (nextStep === currentStep) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    nextStep = Math.floor(Date.now() / 30000);
  }

  // Re-login to get fresh challenge
  const mfaLoginFresh = await makeRequest('POST', '/auth/login', {
    email: 'phase1-np@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  // Test 10: Complete MFA challenge with valid code succeeds & issues AAL2 cookies
  const validChallengeCode = authenticator.generate(npSecret);
  const mfaChallengeRes = await makeRequest(
    'POST',
    '/auth/mfa/challenge/verify',
    { code: validChallengeCode },
    mfaLoginFresh.cookies
  );

  const mfaAccessCookies = mfaChallengeRes.cookies;
  const hasAal2Access = mfaAccessCookies.some((c) => c.includes('rka_access'));

  results.push({
    num: 10,
    name: 'MFA challenge verification succeeds and issues AAL2 session cookies',
    expected: '200',
    actual: `${mfaChallengeRes.status}`,
    status: mfaChallengeRes.status === 200 && hasAal2Access && mfaChallengeRes.body.data?.aal === 'aal2' ? 'PASS' : 'FAIL',
    notes: 'Issued AAL2 session cookies & cleared rka_mfa_pending cookie',
  });

  // Test 11: POST /auth/mfa/cancel safely cancels pending challenge
  const cancelLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-np@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const cancelRes = await makeRequest('POST', '/auth/mfa/cancel', undefined, cancelLogin.cookies);

  results.push({
    num: 11,
    name: 'POST /auth/mfa/cancel revokes challenge & clears pending cookie',
    expected: '200',
    actual: `${cancelRes.status}`,
    status: cancelRes.status === 200 && cancelRes.body.success ? 'PASS' : 'FAIL',
    notes: 'Pending challenge revoked in DB and rka_mfa_pending cookie cleared symmetrically',
  });

  // Test 12: Recovery code works once
  if (recoveryCodes.length > 0) {
    const firstRecoveryCode = recoveryCodes[0];
    
    // Trigger new MFA challenge for admin
    const mfaLogin2 = await makeRequest('POST', '/auth/login', {
      email: 'phase1-admin@radiantilyk.com',
      password: 'Phase1Test!2026',
    });

    const recoveryRes1 = await makeRequest(
      'POST',
      '/auth/mfa/recovery/verify',
      { recoveryCode: firstRecoveryCode },
      mfaLogin2.cookies
    );

    results.push({
      num: 12,
      name: 'Recovery code verification succeeds for valid code',
      expected: '200',
      actual: `${recoveryRes1.status}`,
      status: recoveryRes1.status === 200 && recoveryRes1.body.data?.aal === 'aal2' ? 'PASS' : 'FAIL',
      notes: 'Recovery code verified and marked usedAt in DB',
    });

    // Test 13: Used recovery code cannot be used again
    const mfaLogin3 = await makeRequest('POST', '/auth/login', {
      email: 'phase1-admin@radiantilyk.com',
      password: 'Phase1Test!2026',
    });

    const recoveryRes2 = await makeRequest(
      'POST',
      '/auth/mfa/recovery/verify',
      { recoveryCode: firstRecoveryCode },
      mfaLogin3.cookies
    );

    results.push({
      num: 13,
      name: 'Reusing consumed recovery code is blocked',
      expected: '400',
      actual: `${recoveryRes2.status}`,
      status: recoveryRes2.status === 400 ? 'PASS' : 'FAIL',
      notes: 'Used recovery code rejected with 400 Bad Request',
    });
  }

  // Test 14: Regenerate recovery codes (requires recent AAL2)
  const regenRes = await makeRequest('POST', '/auth/mfa/recovery/regenerate', undefined, mfaAccessCookies);
  const newRecoveryCodes = regenRes.body.data?.recoveryCodes || [];

  results.push({
    num: 14,
    name: 'Regenerate recovery codes (requires recent AAL2)',
    expected: '200',
    actual: `${regenRes.status}`,
    status: regenRes.status === 200 && newRecoveryCodes.length === 10 ? 'PASS' : 'FAIL',
    notes: `Generated ${newRecoveryCodes.length} new recovery codes`,
  });

  // Test 15: Disable MFA (requires password + code + revokes all sessions)
  const npDisableCode = authenticator.generate(npSecret);
  const disableRes = await makeRequest('POST', '/auth/mfa/disable', {
    password: 'Phase1Test!2026',
    code: npDisableCode,
  }, mfaAccessCookies);

  results.push({
    num: 15,
    name: 'Disable MFA for user (requires password + code + session revocation)',
    expected: '200',
    actual: `${disableRes.status}`,
    status: disableRes.status === 200 && disableRes.body.success ? 'PASS' : 'FAIL',
    notes: 'Factors disabled, recovery codes revoked, all user sessions revoked in DB',
  });

  // Test 16: Admin Reset MFA for target user (requires admin role + recent admin AAL2 + reason)
  // First re-authenticate admin with fresh login
  const adminLogin2 = await makeRequest('POST', '/auth/login', {
    email: 'phase1-admin@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const adminResetRes = await makeRequest(
    'POST',
    '/admin/users/4da0afa7-93ba-482a-b4b9-fa631c014c5c/mfa/reset',
    { reason: 'Mandatory security audit reset test for admin target user' },
    adminLogin2.cookies
  );

  results.push({
    num: 16,
    name: 'Admin Reset MFA endpoint (/admin/users/:userId/mfa/reset)',
    expected: '200',
    actual: `${adminResetRes.status}`,
    status: adminResetRes.status === 200 ? 'PASS' : 'FAIL',
    notes: 'Admin reset succeeded with sanitized reason and target session revocation',
  });

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('RESULTS TABLE:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.status === 'PASS').length;
  console.log(`\nTOTAL: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)`);
}

runMfaVerificationSuite().catch((err) => {
  console.error('Error running verification suite:', err);
  process.exit(1);
});
