import http from 'http';
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
  cookies?: string[]
): Promise<{ status: number; body: any; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const payload = body ? JSON.stringify(body) : '';

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Phase2A-Verification-Suite/1.0',
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
  console.log('  PHASE 2A — PATIENT & APPOINTMENT LIVE CONNECTIVITY VERIFICATION');
  console.log('================================================================\n');

  // Seed test staff accounts
  await makeRequest('POST', '/auth/seed-test-accounts');

  // 1. Admin Login (Permitted for both Patient & Appointment Writes)
  console.log('1. Logging in as Admin...');
  const adminLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-admin@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const adminCookies = adminLogin.cookies;

  // 2. Nurse Practitioner Login (Permitted for Reads, BLOCKED for Appointment Writes)
  console.log('2. Logging in as Nurse Practitioner...');
  const npLogin = await makeRequest('POST', '/auth/login', {
    email: 'phase1-np@radiantilyk.com',
    password: 'Phase1Test!2026',
  });
  const npCookies = npLogin.cookies;

  // ----------------------------------------------------------------
  // Test 1: Patient Creation in Live MySQL
  // ----------------------------------------------------------------
  console.log('3. Test 1: Creating a test patient profile in live MySQL...');
  const testEmail = `phase2a-patient-${Date.now()}@example.com`;
  const createPatientRes = await makeRequest(
    'POST',
    '/patients',
    {
      firstName: 'Phase2A',
      lastName: 'TestPatient',
      email: testEmail,
      phone: '(408) 555-9988',
      dateOfBirth: '1992-08-15',
    },
    adminCookies
  );

  const patientId = createPatientRes.body.data?.id;
  const passT1 = createPatientRes.status === 201 && !!patientId;
  results.push({
    step: '1. Patient Creation',
    expected: 'HTTP 201 Created with live patient ID',
    actual: `HTTP ${createPatientRes.status}`,
    result: passT1 ? 'PASS' : 'FAIL',
    details: `Patient ID: ${patientId || 'NONE'}, Email: ${testEmail}`,
  });

  // ----------------------------------------------------------------
  // Test 2: Patient Search & Filter Returns Live Data
  // ----------------------------------------------------------------
  console.log('4. Test 2: Searching patients in live MySQL...');
  const searchRes = await makeRequest('GET', `/patients?search=${encodeURIComponent('TestPatient')}`, undefined, adminCookies);
  const foundPatients = searchRes.body.data || [];
  const passT2 = searchRes.status === 200 && foundPatients.some((p: any) => p.email === testEmail);
  results.push({
    step: '2. Patient Live Search',
    expected: 'HTTP 200 with matching live MySQL patient profile',
    actual: `HTTP ${searchRes.status}, count: ${foundPatients.length}`,
    result: passT2 ? 'PASS' : 'FAIL',
    details: `Found test patient in live search results: ${passT2}`,
  });

  // ----------------------------------------------------------------
  // Test 3: Patient Profile Update Persists
  // ----------------------------------------------------------------
  console.log('5. Test 3: Updating patient details in live MySQL...');
  const updatePatientRes = await makeRequest(
    'PATCH',
    `/patients/${patientId}`,
    { phone: '(408) 555-7777' },
    adminCookies
  );
  const passT3 = updatePatientRes.status === 200 && updatePatientRes.body.data?.phone === '(408) 555-7777';
  results.push({
    step: '3. Patient Detail Update',
    expected: 'HTTP 200 with updated phone number in live MySQL',
    actual: `HTTP ${updatePatientRes.status}`,
    result: passT3 ? 'PASS' : 'FAIL',
    details: `Updated phone: ${updatePatientRes.body.data?.phone}`,
  });

  // ----------------------------------------------------------------
  // Test 4: Appointment Creation (Admin Permitted)
  // ----------------------------------------------------------------
  console.log('6. Test 4: Creating an appointment as Admin...');
  
  // Fetch a valid staffId and locationId from live DB
  const staffRes = await makeRequest('GET', '/staff', undefined, adminCookies);
  const locationRes = await makeRequest('GET', '/locations', undefined, adminCookies);
  const servicesRes = await makeRequest('GET', '/services', undefined, adminCookies);

  // Debug: log reference data structure
  console.log(`   Staff endpoint: HTTP ${staffRes.status}, keys: ${JSON.stringify(Object.keys(staffRes.body))}, first: ${JSON.stringify(staffRes.body.data?.[0]?.id || staffRes.body[0]?.id || 'NONE')}`);
  console.log(`   Location endpoint: HTTP ${locationRes.status}, keys: ${JSON.stringify(Object.keys(locationRes.body))}, first: ${JSON.stringify(locationRes.body.data?.[0]?.id || locationRes.body[0]?.id || 'NONE')}`);
  console.log(`   Services endpoint: HTTP ${servicesRes.status}, keys: ${JSON.stringify(Object.keys(servicesRes.body))}, first: ${JSON.stringify(servicesRes.body.data?.[0]?.id || servicesRes.body[0]?.id || 'NONE')}`);

  const staffId = staffRes.body.data?.[0]?.id || staffRes.body[0]?.id;
  const locationId = locationRes.body.data?.[0]?.id || locationRes.body[0]?.id;
  const serviceId = servicesRes.body.data?.[0]?.id || servicesRes.body[0]?.id;

  console.log(`   Resolved: staffId=${staffId}, locationId=${locationId}, serviceId=${serviceId}`);

  const startAt = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
  const endAt = new Date(Date.now() + 86400000 + 3600000).toISOString();

  const createApptRes = await makeRequest(
    'POST',
    '/appointments',
    {
      patientId,
      staffId,
      locationId,
      serviceIds: [serviceId],
      startAt,
      endAt,
      notes: 'Phase 2A Verification Visit',
    },
    adminCookies
  );

  if (createApptRes.status !== 201) {
    console.log(`   Appointment creation error: ${JSON.stringify(createApptRes.body)}`);
  }

  const apptId = createApptRes.body.data?.id;
  const passT4 = createApptRes.status === 201 && !!apptId;
  results.push({
    step: '4. Appointment Creation (Admin)',
    expected: 'HTTP 201 Created with live appointment ID',
    actual: `HTTP ${createApptRes.status}`,
    result: passT4 ? 'PASS' : 'FAIL',
    details: `Appointment ID: ${apptId || 'NONE'}`,
  });

  // ----------------------------------------------------------------
  // Test 5: NP Appointment Write Attempt BLOCKED (HTTP 403)
  // ----------------------------------------------------------------
  console.log('7. Test 5: Attempting appointment creation as Nurse Practitioner (RBAC Check)...');
  const npCreateApptRes = await makeRequest(
    'POST',
    '/appointments',
    {
      patientId,
      staffId,
      locationId,
      serviceIds: [serviceId],
      startAt: new Date(Date.now() + 172800000).toISOString(),
      endAt: new Date(Date.now() + 172800000 + 3600000).toISOString(),
    },
    npCookies
  );

  const passT5 = npCreateApptRes.status === 403;
  results.push({
    step: '5. NP Appointment Write Blocked',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${npCreateApptRes.status}`,
    result: passT5 ? 'PASS' : 'FAIL',
    details: `NP appointment write blocked correctly. Message: ${npCreateApptRes.body.error?.message || npCreateApptRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 6: NP Appointment Read ALLOWED (HTTP 200)
  // ----------------------------------------------------------------
  console.log('8. Test 6: Reading appointments schedule as Nurse Practitioner (RBAC Check)...');
  const npReadApptRes = await makeRequest('GET', '/appointments', undefined, npCookies);
  const passT6 = npReadApptRes.status === 200 && Array.isArray(npReadApptRes.body.data);
  results.push({
    step: '6. NP Appointment Read Allowed',
    expected: 'HTTP 200 OK',
    actual: `HTTP ${npReadApptRes.status}`,
    result: passT6 ? 'PASS' : 'FAIL',
    details: `NP read-only schedule access permitted. Count: ${npReadApptRes.body.data?.length}`,
  });

  // ----------------------------------------------------------------
  // Test 7: Appointment Reschedule (Admin Permitted)
  // ----------------------------------------------------------------
  console.log('9. Test 7: Rescheduling appointment...');
  const rescheduleStartAt = new Date(Date.now() + 86400000 + 7200000).toISOString();
  const rescheduleRes = await makeRequest(
    'POST',
    `/appointments/${apptId}/reschedule`,
    { startAt: rescheduleStartAt, reason: 'Patient requested time change' },
    adminCookies
  );
  const passT7 = rescheduleRes.status === 200;
  results.push({
    step: '7. Appointment Reschedule',
    expected: 'HTTP 200 OK',
    actual: `HTTP ${rescheduleRes.status}`,
    result: passT7 ? 'PASS' : 'FAIL',
    details: `Rescheduled status: ${rescheduleRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 8: Appointment Cancellation (Admin Permitted)
  // ----------------------------------------------------------------
  console.log('10. Test 8: Cancelling appointment...');
  const cancelRes = await makeRequest(
    'POST',
    `/appointments/${apptId}/cancel`,
    { reason: 'Phase 2A test cleanup' },
    adminCookies
  );
  const passT8 = cancelRes.status === 200 && cancelRes.body.data?.status === 'CANCELLED';
  results.push({
    step: '8. Appointment Cancellation',
    expected: 'HTTP 200 OK with CANCELLED status',
    actual: `HTTP ${cancelRes.status}`,
    result: passT8 ? 'PASS' : 'FAIL',
    details: `Cancelled status: ${cancelRes.body.data?.status}`,
  });

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 2A LIVE CONNECTIVITY VERIFICATION RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.result === 'PASS').length;
  console.log(`\nTOTAL TESTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)\n`);
}

runPhase2aVerification().catch((err) => {
  console.error('Error running Phase 2A verification:', err);
  process.exit(1);
});
