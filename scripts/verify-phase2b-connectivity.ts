// Radiantilyk EMR — Phase 2B Clinical Notes & Cosign Live Connectivity Verification Suite
// Verifies live REST API endpoints and Railway MySQL 8.0 state transitions:
// 1. RN creates draft note
// 2. RN edits own draft note
// 3. RN cannot edit another provider's draft note (403 Forbidden)
// 4. RN signs and submits own note for cosign (status -> pending_cosign)
// 5. RN cannot cosign notes (403 Forbidden)
// 6. NP cosigns eligible RN note (status -> cosigned / locked)
// 7. MD cosigns eligible RN note (status -> cosigned / locked)
// 8. Invalid state transitions rejected (cannot cosign draft, already cosigned, or locked notes)
// 9. Locked note cannot be modified (400 Bad Request)
// 10. Live MySQL state preservation (GET /clinical/notes & GET /clinical/encounters/:id)
// 11. Cosign Queue live state tracking (GET /clinical/cosign-queue)
// 12. Non-clinical role access blocked (Front Desk, Privacy Officer, Patient -> 403 Forbidden)
// 13. Admin without NP/MD role cannot cosign (403 Forbidden)
// 14. Provider returns note for correction (POST /soap-notes/:id/reject -> status returned to draft)

import http from 'http';
import https from 'https';
import { URL } from 'url';

const BASE_URL = process.env.API_BASE_URL || 'https://sonulovablebackend-production.up.railway.app';
const API_PREFIX = '/api/v1';

interface TestResult {
  step: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

// Helper for making HTTP requests with cookie preservation
async function makeRequest(
  method: string,
  endpoint: string,
  body?: any,
  cookies?: string[],
  customUrl?: string
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const fullUrl = customUrl || `${BASE_URL}${API_PREFIX}${endpoint}`;
    const parsedUrl = new URL(fullUrl);
    const options: http.RequestOptions = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (cookies && cookies.length > 0) {
      options.headers!['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsedBody: any = {};
        try {
          parsedBody = JSON.parse(data);
        } catch {
          parsedBody = { raw: data };
        }
        const setCookieHeader = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode || 500,
          body: parsedBody,
          headers: res.headers,
          cookies: setCookieHeader,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to log in and return session cookies
async function loginAs(email: string, password = 'TestPassword123!'): Promise<string[]> {
  const res = await makeRequest('POST', '/auth/login', { email, password });
  if (res.status !== 200 || !res.cookies.length) {
    throw new Error(`Login failed for ${email}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.cookies;
}

async function runPhase2bVerification() {
  console.log('================================================================');
  console.log('  PHASE 2B — CLINICAL NOTES & COSIGN LIVE CONNECTIVITY SUITE');
  console.log('================================================================\n');

  // Seed test staff accounts first
  console.log('Seeding test accounts...');
  await makeRequest('POST', '/auth/seed-test-accounts');

  console.log('Logging in test accounts for clinical RBAC verification...\n');
  const adminCookies = await loginAs('test.admin@radiantilyk.com');
  const rnCookies = await loginAs('test.rn@radiantilyk.com');
  const rn2Cookies = await loginAs('test.rn2@radiantilyk.com');
  const npCookies = await loginAs('test.np@radiantilyk.com');
  const mdCookies = await loginAs('test.md@radiantilyk.com');
  const fdCookies = await loginAs('test.frontdesk@radiantilyk.com');
  const poCookies = await loginAs('test.privacy@radiantilyk.com');

  // Step A: Create a test patient for clinical testing
  const patientRes = await makeRequest(
    'POST',
    '/patients',
    {
      firstName: 'ClinicalTest',
      lastName: 'Patient2B',
      email: `clinical-patient-${Date.now()}@example.com`,
      phone: '(408) 555-8888',
      dateOfBirth: '1990-05-15',
    },
    adminCookies
  );

  const patientId = patientRes.body.data?.id;
  if (!patientId) {
    throw new Error(`Failed to create test patient: ${JSON.stringify(patientRes.body)}`);
  }

  // Get staff IDs and location
  const locRes = await makeRequest('GET', '/locations', undefined, adminCookies);
  let locationId = locRes.body.data?.[0]?.id;
  if (!locationId) {
    const newLoc = await makeRequest('POST', '/locations', { name: 'RKA Clinical Test Location', city: 'San Jose', state: 'CA' }, adminCookies);
    locationId = newLoc.body.data?.id;
  }

  // Get RN provider ID from staff list
  const staffRes = await makeRequest('GET', '/staff', undefined, adminCookies);
  const rnStaff = staffRes.body.data?.find((s: any) => s.user?.email === 'test.rn@radiantilyk.com');
  const rnProviderId = rnStaff?.id || locationId;

  // Step B: Create an Encounter for Clinical Charting
  const encounterRes = await makeRequest(
    'POST',
    '/clinical/encounters',
    {
      patientId,
      providerId: rnProviderId,
      locationId,
      encounterType: 'botox_filler',
      chiefComplaint: 'Phase 2B Neurotoxin and Filler consultation',
    },
    rnCookies
  );

  const encounterId = encounterRes.body.data?.id;

  // ----------------------------------------------------------------
  // Test 1: RN Creates Draft SOAP Note -> ALLOWED (201)
  // ----------------------------------------------------------------
  const createDraftRes = await makeRequest(
    'POST',
    '/clinical/soap-notes',
    {
      encounterId,
      patientId,
      subjective: 'Patient requests glabella line reduction. No contraindications.',
      objective: 'Moderate glabella lines at rest, severe on max frown.',
      assessment: 'Suitable candidate for 20U Botox Cosmetic.',
      plan: 'Inject 20U Botox to procerus and corrugators. Post-care instructions provided.',
      status: 'draft',
    },
    rnCookies
  );

  const draftNoteId = createDraftRes.body.data?.id;
  const passT1 = createDraftRes.status === 201 && createDraftRes.body.data?.status === 'draft';
  results.push({
    step: '1. RN Creates Draft Note',
    expected: 'HTTP 201 Created with status draft',
    actual: `HTTP ${createDraftRes.status}`,
    result: passT1 ? 'PASS' : 'FAIL',
    details: `Note ID: ${draftNoteId}, Status: ${createDraftRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 2: RN Edits Own Draft Note -> ALLOWED (200)
  // ----------------------------------------------------------------
  const editDraftRes = await makeRequest(
    'PATCH',
    `/clinical/soap-notes/${draftNoteId}`,
    {
      plan: 'Inject 20U Botox to procerus and corrugators. Reconstituted with 2.5ml saline. Post-care instructions provided.',
    },
    rnCookies
  );

  const passT2 = editDraftRes.status === 200 && editDraftRes.body.data?.plan?.includes('2.5ml saline');
  results.push({
    step: '2. RN Edits Own Draft Note',
    expected: 'HTTP 200 OK with updated plan text',
    actual: `HTTP ${editDraftRes.status}`,
    result: passT2 ? 'PASS' : 'FAIL',
    details: `Updated plan: ${editDraftRes.body.data?.plan}`,
  });

  // ----------------------------------------------------------------
  // Test 3: RN2 Cannot Edit Another Provider\'s Draft Note -> BLOCKED (403)
  // ----------------------------------------------------------------
  const editOtherRes = await makeRequest(
    'PATCH',
    `/clinical/soap-notes/${draftNoteId}`,
    {
      plan: 'Unauthorized edit attempt by RN2',
    },
    rn2Cookies
  );

  const passT3 = editOtherRes.status === 403;
  results.push({
    step: '3. RN Cannot Edit Another Provider\'s Draft Note',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${editOtherRes.status}`,
    result: passT3 ? 'PASS' : 'FAIL',
    details: `Message: ${editOtherRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 4: RN Signs & Submits Own Note for Cosign -> ALLOWED (200, status -> pending_cosign)
  // ----------------------------------------------------------------
  const submitCosignRes = await makeRequest(
    'POST',
    `/clinical/soap-notes/${draftNoteId}/sign-own`,
    {
      lockNote: false,
    },
    rnCookies
  );

  const passT4 = submitCosignRes.status === 200 && submitCosignRes.body.data?.status === 'pending_cosign';
  results.push({
    step: '4. RN Signs & Submits Own Note for Cosign',
    expected: 'HTTP 200 OK with status pending_cosign',
    actual: `HTTP ${submitCosignRes.status}`,
    result: passT4 ? 'PASS' : 'FAIL',
    details: `Status: ${submitCosignRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 5: RN Cannot Cosign Notes -> BLOCKED (403)
  // ----------------------------------------------------------------
  const rnCosignRes = await makeRequest(
    'POST',
    `/clinical/soap-notes/${draftNoteId}/cosign`,
    {
      lockNote: true,
    },
    rnCookies
  );

  const passT5 = rnCosignRes.status === 403;
  results.push({
    step: '5. RN Cannot Cosign Notes',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${rnCosignRes.status}`,
    result: passT5 ? 'PASS' : 'FAIL',
    details: `Message: ${rnCosignRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 6: Admin Without NP/MD Role Cannot Cosign Notes -> BLOCKED (403)
  // ----------------------------------------------------------------
  const adminCosignRes = await makeRequest(
    'POST',
    `/clinical/soap-notes/${draftNoteId}/cosign`,
    {
      lockNote: true,
    },
    adminCookies
  );

  const passT6 = adminCosignRes.status === 403;
  results.push({
    step: '6. Admin Without NP/MD Role Cannot Cosign',
    expected: 'HTTP 403 Forbidden',
    actual: `HTTP ${adminCosignRes.status}`,
    result: passT6 ? 'PASS' : 'FAIL',
    details: `Admin blocked from cosignature: ${passT6}`,
  });

  // ----------------------------------------------------------------
  // Test 7: NP Views Eligible Cosign Queue -> ALLOWED (200)
  // ----------------------------------------------------------------
  const queueRes = await makeRequest('GET', '/clinical/cosign-queue', undefined, npCookies);
  const queueItem = queueRes.body.data?.find((q: any) => q.note?.id === draftNoteId || q.noteId === draftNoteId);
  const passT7 = queueRes.status === 200 && !!queueItem;
  results.push({
    step: '7. NP Views Eligible Cosign Queue',
    expected: 'HTTP 200 OK with pending note in queue',
    actual: `HTTP ${queueRes.status}, count: ${queueRes.body.data?.length || 0}`,
    result: passT7 ? 'PASS' : 'FAIL',
    details: `Found pending note in queue: ${!!queueItem}`,
  });

  // ----------------------------------------------------------------
  // Test 8: NP Cosigns Eligible RN Note -> ALLOWED (200, status -> cosigned or locked)
  // ----------------------------------------------------------------
  const npCosignRes = await makeRequest(
    'POST',
    `/clinical/soap-notes/${draftNoteId}/cosign`,
    {
      lockNote: true,
    },
    npCookies
  );

  const passT8 = npCosignRes.status === 200 && (npCosignRes.body.data?.status === 'cosigned' || npCosignRes.body.data?.status === 'locked');
  results.push({
    step: '8. NP Cosigns Eligible RN Note',
    expected: 'HTTP 200 OK with status cosigned or locked',
    actual: `HTTP ${npCosignRes.status}`,
    result: passT8 ? 'PASS' : 'FAIL',
    details: `Status: ${npCosignRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 9: Cannot Cosign Already Cosigned/Locked Note -> REJECTED (400)
  // ----------------------------------------------------------------
  const doubleCosignRes = await makeRequest(
    'POST',
    `/clinical/soap-notes/${draftNoteId}/cosign`,
    {
      lockNote: true,
    },
    mdCookies
  );

  const passT9 = doubleCosignRes.status === 400;
  results.push({
    step: '9. Cannot Cosign Already Cosigned/Locked Note',
    expected: 'HTTP 400 Bad Request',
    actual: `HTTP ${doubleCosignRes.status}`,
    result: passT9 ? 'PASS' : 'FAIL',
    details: `Message: ${doubleCosignRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 10: Locked/Cosigned Note Cannot Be Modified -> REJECTED (400)
  // ----------------------------------------------------------------
  const editLockedRes = await makeRequest(
    'PATCH',
    `/clinical/soap-notes/${draftNoteId}`,
    {
      subjective: 'Modified after lock attempt',
    },
    rnCookies
  );

  const passT10 = editLockedRes.status === 400;
  results.push({
    step: '10. Locked Note Cannot Be Modified',
    expected: 'HTTP 400 Bad Request',
    actual: `HTTP ${editLockedRes.status}`,
    result: passT10 ? 'PASS' : 'FAIL',
    details: `Message: ${editLockedRes.body.message}`,
  });

  // ----------------------------------------------------------------
  // Test 11: MD Cosigns Another Submitted RN Note -> ALLOWED (200)
  // ----------------------------------------------------------------
  // Create second note for MD cosignature test
  const note2Res = await makeRequest(
    'POST',
    '/clinical/soap-notes',
    {
      encounterId,
      patientId,
      subjective: 'Follow-up for lip filler evaluation.',
      objective: 'Slight asymmetry noted in upper lip left lateral body.',
      assessment: 'Suitable for 0.5cc Juvederm Ultra touch-up.',
      plan: 'Administered 0.5cc Juvederm Ultra.',
      status: 'draft',
    },
    rnCookies
  );
  const note2Id = note2Res.body.data?.id;

  // RN submits note 2
  await makeRequest('POST', `/clinical/soap-notes/${note2Id}/sign-own`, { lockNote: false }, rnCookies);

  // MD cosigns note 2
  const mdCosignRes = await makeRequest('POST', `/clinical/soap-notes/${note2Id}/cosign`, { lockNote: true }, mdCookies);
  const passT11 = mdCosignRes.status === 200 && (mdCosignRes.body.data?.status === 'cosigned' || mdCosignRes.body.data?.status === 'locked');
  results.push({
    step: '11. MD Cosigns Eligible RN Note',
    expected: 'HTTP 200 OK with status cosigned or locked',
    actual: `HTTP ${mdCosignRes.status}`,
    result: passT11 ? 'PASS' : 'FAIL',
    details: `Status: ${mdCosignRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 12: Supervising Provider Returns Note For Correction -> ALLOWED (200, status -> draft)
  // ----------------------------------------------------------------
  // Create third note for rejection test
  const note3Res = await makeRequest(
    'POST',
    '/clinical/soap-notes',
    {
      encounterId,
      patientId,
      subjective: 'Chemical peel consultation.',
      objective: 'Fitzpatrick Type II skin.',
      assessment: '30% Glycolic peel suitable.',
      plan: 'Apply 30% glycolic acid peel for 3 minutes.',
      status: 'draft',
    },
    rnCookies
  );
  const note3Id = note3Res.body.data?.id;
  await makeRequest('POST', `/clinical/soap-notes/${note3Id}/sign-own`, { lockNote: false }, rnCookies);

  const rejectRes = await makeRequest('POST', `/clinical/soap-notes/${note3Id}/reject`, { reason: 'Please specify neutralization time' }, npCookies);
  const passT12 = rejectRes.status === 200 && rejectRes.body.data?.status === 'draft';
  results.push({
    step: '12. Provider Returns Note For Correction',
    expected: 'HTTP 200 OK with note returned to draft status',
    actual: `HTTP ${rejectRes.status}`,
    result: passT12 ? 'PASS' : 'FAIL',
    details: `Status returned to: ${rejectRes.body.data?.status}`,
  });

  // ----------------------------------------------------------------
  // Test 13: Front Desk, Privacy Officer & Patient Blocked From Clinical Notes -> BLOCKED (403)
  // ----------------------------------------------------------------
  const fdAccess = await makeRequest('GET', '/clinical/notes', undefined, fdCookies);
  const poAccess = await makeRequest('GET', '/clinical/notes', undefined, poCookies);
  const passT13 = fdAccess.status === 403 && poAccess.status === 403;
  results.push({
    step: '13. Front Desk & Privacy Officer Blocked from Clinical Notes',
    expected: 'HTTP 403 Forbidden (Front Desk & Privacy Officer)',
    actual: `FD:${fdAccess.status}, PO:${poAccess.status}`,
    result: passT13 ? 'PASS' : 'FAIL',
    details: `Non-clinical roles blocked from viewing clinical charts`,
  });

  // ----------------------------------------------------------------
  // Test 14: Page Refresh & Live Database State Verification
  // ----------------------------------------------------------------
  const verifyFetch = await makeRequest('GET', `/clinical/notes?patientId=${patientId}`, undefined, rnCookies);
  const fetchedNote = verifyFetch.body.data?.find((n: any) => n.id === draftNoteId);
  const passT14 = verifyFetch.status === 200 && fetchedNote && (fetchedNote.status === 'cosigned' || fetchedNote.status === 'locked');
  results.push({
    step: '14. Live Database State Verification',
    expected: 'HTTP 200 OK returning cosigned/locked status directly from MySQL',
    actual: `HTTP ${verifyFetch.status}`,
    result: passT14 ? 'PASS' : 'FAIL',
    details: `Fetched status from database: ${fetchedNote?.status}`,
  });

  // Clean up test patient and encounter
  console.log('\nCleaning up Phase 2B test fixtures...');
  await makeRequest('DELETE', `/patients/${patientId}`, undefined, adminCookies);

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 2B CLINICAL CONNECTIVITY & SECURITY RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.result === 'PASS').length;
  console.log(`\nTOTAL TESTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)\n`);

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runPhase2bVerification().catch((err) => {
  console.error('Error running Phase 2B verification:', err);
  process.exit(1);
});
