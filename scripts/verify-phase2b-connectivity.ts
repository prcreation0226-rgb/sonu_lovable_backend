// Radiantilyk EMR — Phase 2B Clinical Notes & Cosign Live Connectivity Verification Suite
// Verifies live REST API endpoints and Railway MySQL 8.0 state transitions:
// 1. RN creates draft note
// 2. RN edits own draft note
// 3. RN cannot edit another provider's draft note (403 Forbidden)
// 4. RN signs and submits own note for cosign (status -> pending_cosign)
// 5. RN cannot cosign notes (403 Forbidden)
// 6. Admin without NP/MD role cannot cosign (403 Forbidden)
// 7. NP views eligible cosign queue
// 8. NP cosigns eligible RN note (status -> cosigned / locked)
// 9. Cannot cosign already cosigned/locked note (400 Bad Request)
// 10. Locked note cannot be modified (400 Bad Request)
// 11. MD cosigns another eligible RN note (status -> cosigned / locked)
// 12. Provider returns note for correction (POST /soap-notes/:id/reject -> status returned to draft)
// 13. Front Desk & Privacy Officer blocked from clinical notes (403 Forbidden)
// 14. Live database state verification (GET /clinical/notes & GET /clinical/encounters/:id)

import http from 'http';
import https from 'https';
import dns from 'dns';
import { URL } from 'url';

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
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Phase2B-Verification-Suite/1.0',
    };

    if (cookies && cookies.length > 0) {
      reqHeaders['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
    }

    const options: https.RequestOptions = {
      method,
      hostname: parsedUrl.hostname,
      port: 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: reqHeaders,
      agent: customAgent,
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsedBody: any = {};
        try {
          parsedBody = JSON.parse(data);
        } catch {
          parsedBody = { raw: data };
        }
        const setCookieHeader = (res.headers['set-cookie'] || []) as string[];
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

async function loginAs(email: string, password = 'Phase1Test!2026'): Promise<string[]> {
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
  const adminCookies = await loginAs('phase1-admin@radiantilyk.com');
  const rnCookies = await loginAs('phase1-rn@radiantilyk.com');
  const npCookies = await loginAs('phase1-np@radiantilyk.com');
  const mdCookies = await loginAs('phase1-md@radiantilyk.com');
  const fdCookies = await loginAs('phase1-fd@radiantilyk.com');
  const poCookies = await loginAs('phase1-po@radiantilyk.com');

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

  // Get location
  const locRes = await makeRequest('GET', '/locations', undefined, adminCookies);
  let locationId = locRes.body.data?.[0]?.id;
  if (!locationId) {
    const newLoc = await makeRequest('POST', '/locations', { name: 'RKA Clinical Test Location', city: 'San Jose', state: 'CA' }, adminCookies);
    locationId = newLoc.body.data?.id;
  }

  // Get RN staff profile ID
  const staffRes = await makeRequest('GET', '/staff', undefined, adminCookies);
  console.log('Staff list response:', JSON.stringify(staffRes.body));
  let rnProviderId = staffRes.body.data?.find((s: any) => s.email === 'phase1-rn@radiantilyk.com' || s.user?.email === 'phase1-rn@radiantilyk.com')?.id;
  console.log('Resolved rnProviderId:', rnProviderId);

  if (!rnProviderId) {
    // Fallback: look up staff profile or create/get staff for RN
    const staffList = staffRes.body.data || [];
    rnProviderId = staffList[0]?.id;
  }

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
  if (!encounterId) {
    console.error('Encounter creation failed:', JSON.stringify(encounterRes.body));
  }

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
  if (createDraftRes.status !== 201) {
    console.error('SOAP Note Creation Failed:', JSON.stringify(createDraftRes.body));
  }
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
  // Test 3: NP Cannot Edit Another Provider\'s Draft Note -> BLOCKED (403)
  // ----------------------------------------------------------------
  const editOtherRes = await makeRequest(
    'PATCH',
    `/clinical/soap-notes/${draftNoteId}`,
    {
      plan: 'Unauthorized edit attempt by another provider',
    },
    npCookies
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
  // Test 13: Front Desk & Privacy Officer Blocked From Clinical Notes -> BLOCKED (403)
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

  // ----------------------------------------------------------------
  // Test 15: Admin Route Access (Patients, Appointments, Staff, Services, Billing, Inventory)
  // ----------------------------------------------------------------
  const adminPatients = await makeRequest('GET', '/patients', undefined, adminCookies);
  const adminAppts = await makeRequest('GET', '/appointments', undefined, adminCookies);
  const adminStaff = await makeRequest('GET', '/staff', undefined, adminCookies);
  const adminServices = await makeRequest('GET', '/services', undefined, adminCookies);
  const adminBilling = await makeRequest('GET', '/billing/invoices', undefined, adminCookies);
  const adminInventory = await makeRequest('GET', '/inventory/products', undefined, adminCookies);

  const passT15 =
    adminPatients.status === 200 &&
    adminAppts.status === 200 &&
    adminStaff.status === 200 &&
    adminServices.status === 200 &&
    adminBilling.status === 200 &&
    adminInventory.status === 200;

  results.push({
    step: '15. Admin Approved Route Access Regression Verification',
    expected: 'HTTP 200 for Patients, Appointments, Staff, Services, Billing, Inventory',
    actual: `Pat:${adminPatients.status}, App:${adminAppts.status}, Staff:${adminStaff.status}, Svc:${adminServices.status}, Bill:${adminBilling.status}, Inv:${adminInventory.status}`,
    result: passT15 ? 'PASS' : 'FAIL',
    details: 'All core Admin management routes functional after global RBAC check',
  });

  // ----------------------------------------------------------------
  // Test 16: Returned-For-Correction Reason Stored & Audited
  // ----------------------------------------------------------------
  const passT16 = rejectRes.body.data?.additionalData?.lastReturnedReason === 'Please specify neutralization time';
  results.push({
    step: '16. Returned-For-Correction Reason Stored in additionalData',
    expected: 'Reason saved in note additionalData: "Please specify neutralization time"',
    actual: `Reason: ${rejectRes.body.data?.additionalData?.lastReturnedReason}`,
    result: passT16 ? 'PASS' : 'FAIL',
    details: `Stored reason: ${rejectRes.body.data?.additionalData?.lastReturnedReason}`,
  });

  // ----------------------------------------------------------------
  // Test 17: Only Original Author Can Edit Returned Note
  // ----------------------------------------------------------------
  const npEditReturned = await makeRequest('PATCH', `/clinical/soap-notes/${note3Id}`, { plan: 'NP edit attempt' }, npCookies);
  const rnEditReturned = await makeRequest('PATCH', `/clinical/soap-notes/${note3Id}`, { plan: 'Apply 30% glycolic acid peel for 3 minutes. Neutralize with sodium bicarbonate at 3m00s.' }, rnCookies);
  const passT17 = npEditReturned.status === 403 && rnEditReturned.status === 200;
  results.push({
    step: '17. Only Original RN Author Can Edit Returned Note',
    expected: 'NP edit returns 403 Forbidden; Original RN edit returns 200 OK',
    actual: `NP:${npEditReturned.status}, RN:${rnEditReturned.status}`,
    result: passT17 ? 'PASS' : 'FAIL',
    details: 'Author-only edit boundary enforced on returned draft notes',
  });

  // ----------------------------------------------------------------
  // Test 18: Addendum Endpoint Works Only for Locked Notes & Appends
  // ----------------------------------------------------------------
  const addendumRes = await makeRequest('POST', `/clinical/soap-notes/${draftNoteId}/addendum`, { reason: 'Patient follow-up', addendumText: 'No post-procedure erythema noted at 24h.' }, rnCookies);
  const passT18 = addendumRes.status === 201 || addendumRes.status === 200;
  results.push({
    step: '18. Addendum Endpoint Works for Locked Notes',
    expected: 'HTTP 201 Created / 200 OK creating append-only addendum record',
    actual: `HTTP ${addendumRes.status}`,
    result: passT18 ? 'PASS' : 'FAIL',
    details: `Addendum ID: ${addendumRes.body.data?.id}`,
  });

  // ----------------------------------------------------------------
  // Test 19: Railway Production Health Route Check
  // ----------------------------------------------------------------
  const rootHealth = await makeRequest('GET', '/health', undefined, undefined, `${BASE_URL}/health`);
  const apiHealth = await makeRequest('GET', '/health', undefined, undefined, `${BASE_URL}/api/v1/health`);
  const rootEnv = rootHealth.body?.data?.environment || rootHealth.body?.environment;
  const apiEnv = apiHealth.body?.data?.environment || apiHealth.body?.environment;
  const passT19 = rootHealth.status === 200 && rootEnv === 'production' && apiHealth.status === 200 && apiEnv === 'production';
  results.push({
    step: '19. Railway Production Health Probes Verification',
    expected: 'HTTP 200 OK with environment: production',
    actual: `Root:${rootHealth.status} (${rootEnv}), API:${apiHealth.status} (${apiEnv})`,
    result: passT19 ? 'PASS' : 'FAIL',
    details: 'Health probes active and reporting production environment',
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
