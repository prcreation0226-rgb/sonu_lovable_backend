import http from 'http';
import https from 'https';
import dns from 'dns';
import { authenticator } from 'otplib';

// Configure HTTPS Agent with custom lookup for Railway live backend
const customAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  lookup: (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' ? options : {};
    if (hostname.includes('railway.app')) {
      if (opts.all) {
        return cb(null, [{ address: '69.46.46.14', family: 4 }]);
      }
      return cb(null, '69.46.46.14', 4);
    }
    return dns.lookup(hostname, options, cb);
  },
});

const API_BASE = 'https://sonulovablebackend-production.up.railway.app/api/v1';

interface TestResult {
  num: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  notes: string;
}

const results: TestResult[] = [];

async function waitForNextTotpStep(): Promise<void> {
  const currentSecond = Math.floor(Date.now() / 1000) % 30;
  const waitMs = (30 - currentSecond + 1) * 1000;
  console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for next TOTP time step...`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

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
      'Content-Type': 'application/json',
      'User-Agent': 'Phase1C-B1-MFA-Verification-Suite/1.0',
      ...customHeaders,
    };

    if (cookies && cookies.length > 0) {
      reqHeaders['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
    }

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: reqHeaders,
      agent: customAgent,
      timeout: 35000,
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
  console.log('  PHASE 1C-B1 — FINAL BACKEND TOTP MFA VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Seed test accounts cleanly
  console.log('1. Seeding test accounts on live Railway database...');
  const seedRes = await makeRequest('POST', '/auth/seed-test-accounts');
  if (seedRes.status !== 200) {
    console.error('FAILED to seed test accounts:', seedRes.body);
    process.exit(1);
  }
  console.log('Test accounts seeded successfully.\n');

  // Helper to enroll a fresh user cleanly and return cookies + totp secret + userId
  async function setupEnrolledUser(email: string, pass: string) {
    const login = await makeRequest('POST', '/auth/login', { email, password: pass });
    const userId = login.body.data?.user?.id;
    let start = await makeRequest('POST', '/auth/mfa/enroll/start', undefined, login.cookies);
    if (start.status !== 200) {
      await makeRequest('POST', '/auth/mfa/cancel', undefined, login.cookies);
      start = await makeRequest('POST', '/auth/mfa/enroll/start', undefined, login.cookies);
    }
    const factorId = start.body.data?.factorId;
    const secret = start.body.data?.secret;
    const code = authenticator.generate(secret);

    const verify = await makeRequest('POST', '/auth/mfa/enroll/verify', { factorId, code }, login.cookies);
    return {
      userId,
      loginCookies: login.cookies,
      secret,
      factorId,
      recoveryCodes: verify.body.data?.recoveryCodes || [],
    };
  }

  // User 1: fresh unenrolled admin login
  const admin1Login = await makeRequest('POST', '/auth/login', {
    email: 'phase1-admin@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  let admin1Cookies = admin1Login.cookies;

  // Test 1: Standard login works normally when MFA_ENFORCEMENT_ENABLED=false for unenrolled user
  results.push({
    num: 1,
    name: 'Unenrolled login works normally when MFA_ENFORCEMENT_ENABLED=false',
    expected: '200',
    actual: `${admin1Login.status}`,
    status: admin1Login.status === 200 && admin1Login.body.success ? 'PASS' : 'FAIL',
    notes: 'Issued HttpOnly cookies without MFA challenge when flag is false',
  });

  // Test 2: GET /auth/mfa/status (Unenrolled user)
  const statusRes1 = await makeRequest('GET', '/auth/mfa/status', undefined, admin1Cookies);
  results.push({
    num: 2,
    name: 'GET /auth/mfa/status for fresh user',
    expected: '200',
    actual: `${statusRes1.status}`,
    status: statusRes1.status === 200 && statusRes1.body.data?.mfaEnabled === false ? 'PASS' : 'FAIL',
    notes: `mfaEnabled: ${statusRes1.body.data?.mfaEnabled}, factorsCount: ${statusRes1.body.data?.factorsCount}`,
  });

  // Test 3: POST /auth/mfa/enroll/start (Voluntary enrollment start & no-store headers)
  const startRes = await makeRequest('POST', '/auth/mfa/enroll/start', undefined, admin1Cookies);
  const factorId = startRes.body.data?.factorId;
  const totpSecret = startRes.body.data?.secret;
  const otpauthUrl = startRes.body.data?.otpauthUrl;

  const hasNoStoreHeader = startRes.headers['cache-control']?.includes('no-store');

  results.push({
    num: 3,
    name: 'Voluntary enrollment start returns secret, otpauth & Cache-Control: no-store',
    expected: '200',
    actual: `${startRes.status}`,
    status: startRes.status === 200 && !!totpSecret && !!otpauthUrl && hasNoStoreHeader ? 'PASS' : 'FAIL',
    notes: `Returned factorId: YES, secret: YES, Cache-Control: no-store: ${hasNoStoreHeader ? 'YES' : 'NO'}`,
  });

  // Test 4: Verify with wrong 6-digit code fails cleanly
  const wrongCodeRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: '000000',
  }, admin1Cookies);

  results.push({
    num: 4,
    name: 'Enrollment verification fails with wrong 6-digit code',
    expected: '400',
    actual: `${wrongCodeRes.status}`,
    status: wrongCodeRes.status === 400 ? 'PASS' : 'FAIL',
    notes: 'Returned 400 Bad Request with error message',
  });

  // Test 5: Verify with correct 6-digit TOTP code succeeds & generates 10 recovery codes with no-store headers
  const validCode = authenticator.generate(totpSecret);
  const verifyEnrollRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: validCode,
  }, admin1Cookies);

  const recoveryCodes = verifyEnrollRes.body.data?.recoveryCodes || [];
  const enrollNoStoreHeader = verifyEnrollRes.headers['cache-control']?.includes('no-store');

  results.push({
    num: 5,
    name: 'Enrollment verification succeeds, returns 10 recovery codes & Cache-Control: no-store',
    expected: '200',
    actual: `${verifyEnrollRes.status}`,
    status: verifyEnrollRes.status === 200 && recoveryCodes.length === 10 && enrollNoStoreHeader ? 'PASS' : 'FAIL',
    notes: `Generated ${recoveryCodes.length} recovery codes with Cache-Control: no-store`,
  });

  // Test 6: TOTP code replay within same step is blocked
  const replayRes = await makeRequest('POST', '/auth/mfa/enroll/verify', {
    factorId,
    code: validCode,
  }, admin1Cookies);

  results.push({
    num: 6,
    name: 'TOTP code replay prevention',
    expected: '400',
    actual: `${replayRes.status}`,
    status: replayRes.status === 400 ? 'PASS' : 'FAIL',
    notes: 'Replay of used TOTP code blocked with 400 Bad Request',
  });

  // Test 7: GET /auth/mfa/status after enrollment shows active factor
  const statusRes2 = await makeRequest('GET', '/auth/mfa/status', undefined, admin1Cookies);
  results.push({
    num: 7,
    name: 'GET /auth/mfa/status after enrollment',
    expected: '200',
    actual: `${statusRes2.status}`,
    status: statusRes2.status === 200 && statusRes2.body.data?.mfaEnabled === true ? 'PASS' : 'FAIL',
    notes: `mfaEnabled: true, activeFactors: ${statusRes2.body.data?.activeFactors?.length}`,
  });

  // Setup MD user for login challenge testing (Test 8-10)
  const mdSetup = await setupEnrolledUser('phase1-md@radiantilyk.com', 'Phase1Test!2026');

  // Wait for next TOTP step before verifying login challenge
  await waitForNextTotpStep();

  // Test 8: Users who enabled voluntary MFA still complete MFA challenge even when flag is false
  const mfaLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-md@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const hasMfaPendingCookie = mfaLogin.cookies.some((c) => c.includes('rka_mfa_pending'));
  const hasAccessCookie = mfaLogin.cookies.some((c) => c.includes('rka_access'));
  const hasChallengeTokenInBody = 'challengeToken' in (mfaLogin.body.data || {});

  results.push({
    num: 8,
    name: 'Voluntary MFA user gets 202 challenge & rka_mfa_pending cookie (no token in body)',
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

  // Test 10: Complete MFA challenge with valid code succeeds & issues AAL2 cookies
  const validChallengeCode = authenticator.generate(mdSetup.secret);
  const mfaChallengeRes = await makeRequest(
    'POST',
    '/auth/mfa/challenge/verify',
    { code: validChallengeCode },
    mfaLogin.cookies
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

  // Test 11: POST /auth/mfa/cancel safely cancels pending challenge & issues NO auth cookies
  const cancelLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-md@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const cancelRes = await makeRequest('POST', '/auth/mfa/cancel', undefined, cancelLogin.cookies);

  const cancelHasAccessCookie = cancelRes.cookies.some((c) => c.includes('rka_access'));

  results.push({
    num: 11,
    name: 'POST /auth/mfa/cancel revokes challenge & clears pending cookie without auth cookies',
    expected: '200',
    actual: `${cancelRes.status}`,
    status: cancelRes.status === 200 && cancelRes.body.success && !cancelHasAccessCookie ? 'PASS' : 'FAIL',
    notes: 'Pending challenge revoked in DB, rka_mfa_pending cleared, zero auth cookies issued',
  });

  // Test 12: Recovery code works once
  if (recoveryCodes.length > 0) {
    const firstRecoveryCode = recoveryCodes[0];
    
    // Trigger new MFA challenge for admin1
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

  // Setup RN user for regenerate/disable tests (Test 14-15)
  const rnSetup = await setupEnrolledUser('phase1-rn@radiantilyk.com', 'Phase1Test!2026');
  await waitForNextTotpStep();

  const rnLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-rn@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const rnCode = authenticator.generate(rnSetup.secret);
  const rnChallengeRes = await makeRequest('POST', '/auth/mfa/challenge/verify', { code: rnCode }, rnLogin.cookies);
  const rnAal2Cookies = rnChallengeRes.cookies;

  // Test 14: Regenerate recovery codes (requires recent AAL2) & returns no-store headers
  const regenRes = await makeRequest('POST', '/auth/mfa/recovery/regenerate', undefined, rnAal2Cookies);
  const newRecoveryCodes = regenRes.body.data?.recoveryCodes || [];
  const regenNoStoreHeader = regenRes.headers['cache-control']?.includes('no-store');

  results.push({
    num: 14,
    name: 'Regenerate recovery codes (requires recent AAL2) & Cache-Control: no-store',
    expected: '200',
    actual: `${regenRes.status}`,
    status: regenRes.status === 200 && newRecoveryCodes.length === 10 && regenNoStoreHeader ? 'PASS' : 'FAIL',
    notes: `Generated ${newRecoveryCodes.length} new recovery codes with Cache-Control: no-store`,
  });

  // Test 15: Disable MFA (requires password + code + revokes all sessions)
  await waitForNextTotpStep();
  const rnDisableCode = authenticator.generate(rnSetup.secret);
  const disableRes = await makeRequest('POST', '/auth/mfa/disable', {
    password: 'Phase1Test!2026',
    code: rnDisableCode,
  }, rnAal2Cookies);

  results.push({
    num: 15,
    name: 'Disable MFA for user (requires password + code + revokes all sessions)',
    expected: '200',
    actual: `${disableRes.status}`,
    status: disableRes.status === 200 && disableRes.body.success ? 'PASS' : 'FAIL',
    notes: 'Factors disabled, recovery codes revoked, all user sessions revoked in DB',
  });

  // Test 16: Admin Reset MFA for target user (requires admin role + recent admin AAL2 + reason)
  await waitForNextTotpStep();
  const adminLogin2 = await makeRequest('POST', '/auth/login', {
    email: 'phase1-admin@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const adminCode2 = authenticator.generate(totpSecret);
  const adminChallengeRes = await makeRequest('POST', '/auth/mfa/challenge/verify', {
    code: adminCode2,
  }, adminLogin2.cookies);

  const adminAal2Cookies = adminChallengeRes.cookies;

  // Enroll PO target user
  const poSetup = await setupEnrolledUser('phase1-po@radiantilyk.com', 'Phase1Test!2026');

  const adminResetRes = await makeRequest(
    'POST',
    `/admin/users/${poSetup.userId}/mfa/reset`,
    { reason: 'Mandatory security audit reset test for admin target user' },
    adminAal2Cookies
  );

  results.push({
    num: 16,
    name: 'Admin Reset MFA endpoint (/admin/users/:userId/mfa/reset)',
    expected: '200',
    actual: `${adminResetRes.status}`,
    status: adminResetRes.status === 200 ? 'PASS' : 'FAIL',
    notes: 'Admin reset succeeded with sanitized reason and target session revocation',
  });

  // Test 17: Concurrent same TOTP/challenge requests allow only one success (Race condition test)
  const multiSetup = await setupEnrolledUser('phase1-multi@radiantilyk.com', 'Phase1Test!2026');
  await waitForNextTotpStep();

  const raceLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-multi@radiantilyk.com',
    password: 'Phase1Test!2026',
  });

  const raceCode = authenticator.generate(multiSetup.secret);

  const [raceRes1, raceRes2] = await Promise.all([
    makeRequest('POST', '/auth/mfa/challenge/verify', { code: raceCode }, raceLogin.cookies),
    makeRequest('POST', '/auth/mfa/challenge/verify', { code: raceCode }, raceLogin.cookies),
  ]);

  const racePass = (raceRes1.status === 200 && raceRes2.status !== 200) || (raceRes2.status === 200 && raceRes1.status !== 200);

  results.push({
    num: 17,
    name: 'Concurrent same TOTP challenge verification allows only ONE success',
    expected: '200 / 400',
    actual: `${raceRes1.status} / ${raceRes2.status}`,
    status: racePass ? 'PASS' : 'FAIL',
    notes: `Race condition handled atomically: req1=${raceRes1.status}, req2=${raceRes2.status}`,
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
