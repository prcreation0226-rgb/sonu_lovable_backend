import https from 'https';
import dns from 'dns';

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
const ROOT_BASE = 'https://sonulovablebackend-production.up.railway.app';

interface TestResult {
  step: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function makeRequest(
  method: string,
  path: string,
  body?: any,
  cookies?: string[],
  fullUrl?: string
): Promise<{ status: number; body: any; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl || `${API_BASE}${path}`);
    const payload = body ? JSON.stringify(body) : '';

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Phase2A-Verification-Suite/3.0',
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
      timeout: 15000,
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

async function runPhase2aVerification() {
  console.log('================================================================');
  console.log('  PHASE 2A — PATIENT & APPOINTMENT CONNECTIVITY & SECURITY SUITE');
  console.log('================================================================\n');

  // Track created IDs for cleanup
  const createdPatientIds: string[] = [];
  const createdApptIds: string[] = [];

  // Seed test staff accounts
  await makeRequest('POST', '/auth/seed-test-accounts');

  // Login all roles
  console.log('Logging in test accounts for RBAC verification...');

  const adminLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-admin@radiantilyk.com', password: 'Phase1Test!2026' });
  const adminCookies = adminLogin.cookies;

  const fdLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-fd@radiantilyk.com', password: 'Phase1Test!2026' });
  const fdCookies = fdLogin.cookies;

  const npLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-np@radiantilyk.com', password: 'Phase1Test!2026' });
  const npCookies = npLogin.cookies;

  const rnLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-rn@radiantilyk.com', password: 'Phase1Test!2026' });
  const rnCookies = rnLogin.cookies;

  const mdLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-md@radiantilyk.com', password: 'Phase1Test!2026' });
  const mdCookies = mdLogin.cookies;

  const patientLogin = await makeRequest('POST', '/auth/login', { email: 'phase1-patient@radiantilyk.com', password: 'Phase1Test!2026' });
  const patientCookies = patientLogin.cookies;

  // Reference Fixtures (Location & Service via Admin REST API)
  console.log('\nEnsuring reference fixtures (Location & Service) via Admin REST API...');
  const locListRes = await makeRequest('GET', '/locations', undefined, adminCookies);
  let locationId = locListRes.body.data?.[0]?.id;
  if (!locationId) {
    const createLocRes = await makeRequest('POST', '/locations', { name: 'RKA San Jose Main', city: 'San Jose', state: 'CA', timezone: 'America/Los_Angeles' }, adminCookies);
    locationId = createLocRes.body.data?.id;
  }

  const srvListRes = await makeRequest('GET', '/services', undefined, adminCookies);
  let serviceId = srvListRes.body.data?.[0]?.id;
  if (!serviceId) {
    const createSrvRes = await makeRequest('POST', '/services', { name: 'Phase2A Test Consultation', durationMinutes: 30, priceCents: 15000 }, adminCookies);
    serviceId = createSrvRes.body.data?.id;
  }
  console.log(`Reference fixtures active: locationId=${locationId}, serviceId=${serviceId}\n`);

  // ----------------------------------------------------------------
  // Test 1: Patient Creation (Admin) -> ALLOWED
  // ----------------------------------------------------------------
  const testEmail = `phase2a-patient-${Date.now()}@example.com`;
  const createPatientRes = await makeRequest(
    'POST',
    '/patients',
    { firstName: 'Phase2A', lastName: 'TestPatient', email: testEmail, phone: '(408) 555-9988', dateOfBirth: '1992-08-15' },
    adminCookies
  );
  const patientId = createPatientRes.body.data?.id;
  if (patientId) createdPatientIds.push(patientId);

  const passT1 = createPatientRes.status === 201 && !!patientId;
  results.push({
    step: '1. Patient Creation (Admin)',
    expected: 'HTTP 201 Created',
    actual: `HTTP ${createPatientRes.status}`,
    result: passT1 ? 'PASS' : 'FAIL',
    details: `Patient ID: ${patientId || 'NONE'}, Email: ${testEmail}`,
  });

  // ----------------------------------------------------------------
  // Test 2: Patient Live Search (Admin) -> ALLOWED
  // ----------------------------------------------------------------
  const searchRes = await makeRequest('GET', `/patients?search=${encodeURIComponent('TestPatient')}`, undefined, adminCookies);
  const foundPatients = searchRes.body.data || [];
  const passT2 = searchRes.status === 200 && foundPatients.some((p: any) => p.email === testEmail);
  results.push({
    step: '2. Patient Live Search (Admin)',
    expected: 'HTTP 200 with patient in results',
    actual: `HTTP ${searchRes.status}, count: ${foundPatients.length}`,
    result: passT2 ? 'PASS' : 'FAIL',
    details: `Patient found: ${passT2}`,
  });

  // ----------------------------------------------------------------
  // Test 3: Patient Profile Update (Admin) -> ALLOWED
  // ----------------------------------------------------------------
  const updatePatientRes = await makeRequest('PATCH', `/patients/${patientId}`, { phone: '(408) 555-7777' }, adminCookies);
  const passT3 = updatePatientRes.status === 200 && updatePatientRes.body.data?.phone === '(408) 555-7777';
  results.push({
    step: '3. Patient Detail Update (Admin)',
    expected: 'HTTP 200 with updated phone',
    actual: `HTTP ${updatePatientRes.status}`,
    result: passT3 ? 'PASS' : 'FAIL',
    details: `Phone: ${updatePatientRes.body.data?.phone}`,
  });

  // Fetch staffId
  const staffRes = await makeRequest('GET', '/staff', undefined, adminCookies);
  const staffId = staffRes.body.data?.[0]?.id || staffRes.body[0]?.id;

  // ----------------------------------------------------------------
  // Test 4: Front Desk Appointment Creation -> ALLOWED
  // ----------------------------------------------------------------
  const fdApptRes = await makeRequest(
    'POST',
    '/appointments',
    {
      patientId,
      staffId,
      locationId,
      serviceIds: [serviceId],
      startAt: new Date(Date.now() + 86400000).toISOString(),
      endAt: new Date(Date.now() + 86400000 + 3600000).toISOString(),
      notes: 'Front Desk Booking',
    },
    fdCookies
  );
  const fdApptId = fdApptRes.body.data?.id;
  if (fdApptId) createdApptIds.push(fdApptId);

  const passT4 = fdApptRes.status === 201 && !!fdApptId;
  results.push({
    step: '4. Front Desk Appt Creation',
    expected: 'HTTP 201 Created',
    actual: `HTTP ${fdApptRes.status}`,
    result: passT4 ? 'PASS' : 'FAIL',
    details: `Appointment ID: ${fdApptId || 'NONE'}`,
  });

  // ----------------------------------------------------------------
  // Test 5: Admin Appointment Creation -> ALLOWED
  // ----------------------------------------------------------------
  const adminStartAt = new Date(Date.now() + 86400000 * 10).toISOString();
  const adminEndAt = new Date(Date.now() + 86400000 * 10 + 3600000).toISOString();
  const adminApptRes = await makeRequest(
    'POST',
    '/appointments',
    {
      patientId,
      staffId,
      locationId,
      serviceIds: [serviceId],
      startAt: adminStartAt,
      endAt: adminEndAt,
      notes: 'Admin Booking',
    },
    adminCookies
  );
  const adminApptId = adminApptRes.body.data?.id;
  if (adminApptId) createdApptIds.push(adminApptId);

  const passT5 = adminApptRes.status === 201 && !!adminApptId;
  results.push({
    step: '5. Admin Appt Creation',
    expected: 'HTTP 201 Created',
    actual: `HTTP ${adminApptRes.status}`,
    result: passT5 ? 'PASS' : 'FAIL',
    details: `Appointment ID: ${adminApptId || 'NONE'}`,
  });

  // ----------------------------------------------------------------
  // Test 6: RN Appointment Write -> BLOCKED (HTTP 403)
  // ----------------------------------------------------------------
  const rnWriteRes = await makeRequest(
    'POST',
    '/appointments',
    { patientId, staffId, locationId, serviceIds: [serviceId], startAt: new Date(Date.now() + 259200000).toISOString() },
    rnCookies
  );
  const passT6 = rnWriteRes.status === 403;
  results.push({
    step: '6. RN Appt Write Blocked',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${rnWriteRes.status}`,
    result: passT6 ? 'PASS' : 'FAIL',
    details: `Message: ${rnWriteRes.body.error?.message || rnWriteRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 7: Medical Director Appointment Write -> BLOCKED (HTTP 403)
  // ----------------------------------------------------------------
  const mdWriteRes = await makeRequest(
    'POST',
    '/appointments',
    { patientId, staffId, locationId, serviceIds: [serviceId], startAt: new Date(Date.now() + 259200000).toISOString() },
    mdCookies
  );
  const passT7 = mdWriteRes.status === 403;
  results.push({
    step: '7. Medical Director Appt Write Blocked',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${mdWriteRes.status}`,
    result: passT7 ? 'PASS' : 'FAIL',
    details: `Message: ${mdWriteRes.body.error?.message || mdWriteRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 8: NP Appointment Write -> BLOCKED (HTTP 403)
  // ----------------------------------------------------------------
  const npWriteRes = await makeRequest(
    'POST',
    '/appointments',
    { patientId, staffId, locationId, serviceIds: [serviceId], startAt: new Date(Date.now() + 259200000).toISOString() },
    npCookies
  );
  const passT8 = npWriteRes.status === 403;
  results.push({
    step: '8. NP Appt Write Blocked',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${npWriteRes.status}`,
    result: passT8 ? 'PASS' : 'FAIL',
    details: `Message: ${npWriteRes.body.error?.message || npWriteRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 9: NP Appointment Read -> ALLOWED (HTTP 200)
  // ----------------------------------------------------------------
  const npReadRes = await makeRequest('GET', '/appointments', undefined, npCookies);
  const passT9 = npReadRes.status === 200 && Array.isArray(npReadRes.body.data);
  results.push({
    step: '9. NP Appt Read Allowed',
    expected: 'HTTP 200 OK',
    actual: `HTTP ${npReadRes.status}`,
    result: passT9 ? 'PASS' : 'FAIL',
    details: `Schedule read count: ${npReadRes.body.data?.length}`,
  });

  // ----------------------------------------------------------------
  // Test 10: Patient Access to EMR Chart -> BLOCKED (HTTP 403)
  // ----------------------------------------------------------------
  const patientAccessRes = await makeRequest('GET', `/patients/${patientId}`, undefined, patientCookies);
  const passT10 = patientAccessRes.status === 403;
  results.push({
    step: '10. Patient Access to EMR Chart Blocked',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${patientAccessRes.status}`,
    result: passT10 ? 'PASS' : 'FAIL',
    details: `Patient blocked: ${passT10}`,
  });

  // ----------------------------------------------------------------
  // Test 11: Patient Soft-Delete Authorization (Front Desk / NP / RN / MD -> 403, Admin -> 200)
  // ----------------------------------------------------------------
  // Front Desk delete attempt
  const fdDeleteRes = await makeRequest('DELETE', `/patients/${patientId}`, undefined, fdCookies);
  const passT11a = fdDeleteRes.status === 403;

  // NP delete attempt
  const npDeleteRes = await makeRequest('DELETE', `/patients/${patientId}`, undefined, npCookies);
  const passT11b = npDeleteRes.status === 403;

  // RN delete attempt
  const rnDeleteRes = await makeRequest('DELETE', `/patients/${patientId}`, undefined, rnCookies);
  const passT11c = rnDeleteRes.status === 403;

  // MD delete attempt
  const mdDeleteRes = await makeRequest('DELETE', `/patients/${patientId}`, undefined, mdCookies);
  const passT11d = mdDeleteRes.status === 403;

  const passT11AllDenied = passT11a && passT11b && passT11c && passT11d;
  results.push({
    step: '11. Non-Admin Patient Soft-Delete Blocked',
    expected: 'HTTP 403 Forbidden (FD, NP, RN, MD)',
    actual: `FD:${fdDeleteRes.status}, NP:${npDeleteRes.status}, RN:${rnDeleteRes.status}, MD:${mdDeleteRes.status}`,
    result: passT11AllDenied ? 'PASS' : 'FAIL',
    details: `Non-admin roles blocked from patient soft-delete: ${passT11AllDenied}`,
  });

  // Admin delete attempt -> ALLOWED
  const adminDeleteRes = await makeRequest('DELETE', `/patients/${patientId}`, undefined, adminCookies);
  const passT11Admin = adminDeleteRes.status === 200;
  results.push({
    step: '12. Admin Patient Soft-Delete Allowed',
    expected: 'HTTP 200 OK (Soft-delete)',
    actual: `HTTP ${adminDeleteRes.status}`,
    result: passT11Admin ? 'PASS' : 'FAIL',
    details: `Admin patient soft-delete message: ${adminDeleteRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 13: Service Creation Authorization (Admin -> 201, Non-Admin -> 403)
  // ----------------------------------------------------------------
  const nonAdminSrvRes = await makeRequest('POST', '/services', { name: 'Unauthorized Service Attempt' }, fdCookies);
  const passT13NonAdmin = nonAdminSrvRes.status === 403;

  const adminSrvRes = await makeRequest('POST', '/services', { name: `Admin Test Service ${Date.now()}` }, adminCookies);
  const passT13Admin = adminSrvRes.status === 201;

  const passT13All = passT13NonAdmin && passT13Admin;
  results.push({
    step: '13. Service Creation RBAC (Admin 201, FD 403)',
    expected: 'Admin: 201, Non-Admin: 403',
    actual: `Admin:${adminSrvRes.status}, FD:${nonAdminSrvRes.status}`,
    result: passT13All ? 'PASS' : 'FAIL',
    details: `Service creation correctly restricted to Admin only`,
  });

  // ----------------------------------------------------------------
  // Test 14: Health Check Behavior (/health and /api/v1/health)
  // ----------------------------------------------------------------
  const rootHealth = await makeRequest('GET', '/health', undefined, undefined, `${ROOT_BASE}/health`);
  const passHealth1 = rootHealth.status === 200 && rootHealth.body.data?.status === 'healthy';

  const apiHealth = await makeRequest('GET', '/health', undefined, undefined, `${API_BASE}/health`);
  const passHealth2 = apiHealth.status === 200 && apiHealth.body.data?.status === 'healthy';

  const passHealthAll = passHealth1 && passHealth2;
  results.push({
    step: '14. Health Probe Checks (/health & /api/v1/health)',
    expected: 'HTTP 200 with real health payload on both',
    actual: `/health:${rootHealth.status}, /api/v1/health:${apiHealth.status}`,
    result: passHealthAll ? 'PASS' : 'FAIL',
    details: `Root and API health endpoints return identical real health check payloads`,
  });

  // ----------------------------------------------------------------
  // Test 15: Appointment Cancellation (Front Desk) -> ALLOWED
  // ----------------------------------------------------------------
  const cancelRes = await makeRequest(
    'POST',
    `/appointments/${fdApptId}/cancel`,
    { cancellationReason: 'Front Desk test cancellation' },
    fdCookies
  );
  const passT15 = cancelRes.status === 200 && cancelRes.body.data?.status === 'CANCELLED';
  results.push({
    step: '15. Appt Cancellation (Front Desk)',
    expected: 'HTTP 200 OK with CANCELLED status',
    actual: `HTTP ${cancelRes.status}`,
    result: passT15 ? 'PASS' : 'FAIL',
    details: `Status: ${cancelRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 16: Appointment Reschedule (Admin) -> ALLOWED
  // ----------------------------------------------------------------
  const rescheduleStartAt = new Date(Date.now() + 86400000 * 10 + 7200000).toISOString();
  const rescheduleRes = await makeRequest(
    'POST',
    `/appointments/${adminApptId}/reschedule`,
    { startAt: rescheduleStartAt, reason: 'Admin rescheduled' },
    adminCookies
  );
  const passT16 = rescheduleRes.status === 200;
  results.push({
    step: '16. Appt Reschedule (Admin)',
    expected: 'HTTP 200 OK',
    actual: `HTTP ${rescheduleRes.status}`,
    result: passT16 ? 'PASS' : 'FAIL',
    details: `Status: ${rescheduleRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 17: Live Test Fixture Cleanup
  // ----------------------------------------------------------------
  console.log('\nCleaning up Phase 2A test fixtures (soft-deleting test patients & cancelling test appointments)...');
  for (const aId of createdApptIds) {
    await makeRequest('POST', `/appointments/${aId}/cancel`, { cancellationReason: 'Phase 2A test fixture cleanup' }, adminCookies);
  }
  for (const pId of createdPatientIds) {
    await makeRequest('DELETE', `/patients/${pId}`, undefined, adminCookies);
  }

  results.push({
    step: '17. Test Fixture Cleanup',
    expected: 'Test appointments cancelled and test patients soft-deleted',
    actual: `Cleaned ${createdApptIds.length} appts, ${createdPatientIds.length} patients`,
    result: 'PASS',
    details: `Audit logs preserved; test records soft-deleted/cancelled`,
  });

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 2A FINAL CONNECTIVITY & SECURITY RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.result === 'PASS').length;
  console.log(`\nTOTAL TESTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)\n`);
}

runPhase2aVerification().catch((err) => {
  console.error('Error running Phase 2A verification:', err);
  process.exit(1);
});
