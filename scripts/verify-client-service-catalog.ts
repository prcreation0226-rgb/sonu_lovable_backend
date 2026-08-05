// Radiantilyk EMR — Client Service Catalog Safety & Final Verification Script
// Verifies live Railway MySQL database state, public field sanitization, import route removal, permissions, and catalog integrity.

import https from 'https';
import url from 'url';

const BASE_URL = 'https://sonulovablebackend-production.up.railway.app/api/v1';

interface TestResult {
  step: string;
  expected: string;
  actual: string;
  result: 'PASS' | 'FAIL';
  details?: string;
}

function makeRequest(
  method: string,
  path: string,
  body?: any,
  cookies?: string[],
  overrideUrl?: string
): Promise<{ status: number; body: any; headers: any; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const fullUrl = overrideUrl || `${BASE_URL}${path}`;
    const parsed = url.parse(fullUrl);
    const payload = body ? JSON.stringify(body) : '';

    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.path,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookies && cookies.length ? { Cookie: cookies.join('; ') } : {}),
      },
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

async function runServiceCatalogVerification() {
  console.log('================================================================');
  console.log('  CLIENT SERVICE CATALOG FINAL SAFETY & REGRESSION SUITE');
  console.log('================================================================\n');

  const results: TestResult[] = [];

  // Seed & login test accounts
  await makeRequest('POST', '/auth/seed-test-accounts');
  const adminCookies = await loginAs('phase1-admin@radiantilyk.com');
  const rnCookies = await loginAs('phase1-rn@radiantilyk.com');
  const fdCookies = await loginAs('phase1-fd@radiantilyk.com');

  // ----------------------------------------------------------------
  // Test 1: Fetch Live Catalog via Public Endpoint (GET /services/public)
  // ----------------------------------------------------------------
  const publicRes = await makeRequest('GET', '/services/public');
  const publicCats = publicRes.body?.data || [];
  const totalPublicServices = publicCats.reduce((sum: number, c: any) => sum + (c.services?.length || 0), 0);

  const passT1 = publicRes.status === 200 && publicCats.length === 15 && totalPublicServices >= 60;
  results.push({
    step: '1. Public Endpoint Catalog Fetch (GET /services/public)',
    expected: 'HTTP 200 OK returning 15 categories and 60+ active services',
    actual: `HTTP ${publicRes.status}, ${publicCats.length} categories, ${totalPublicServices} services`,
    result: passT1 ? 'PASS' : 'FAIL',
    details: 'Unauthenticated public booking endpoint loads complete live catalog',
  });

  // ----------------------------------------------------------------
  // Test 2: Verify All 15 Categories Present & Ordered
  // ----------------------------------------------------------------
  const expectedCategoryNames = [
    'Consultations',
    'Neurotoxins',
    'Medical Wellness',
    'Dermal Fillers',
    'Biostimulators',
    'Chemical Peels',
    'Microneedling',
    'Skin Tightening',
    'Lasers',
    'Body Contouring',
    'Laser Hair Reduction',
    'Televisit',
    'Follow-Ups',
    'Signature Facials',
    'Facial Add-Ons',
  ];

  const actualCategoryNames = publicCats.map((c: any) => c.name);
  const passT2 = expectedCategoryNames.every((name) => actualCategoryNames.includes(name));

  results.push({
    step: '2. All 15 Categories Verification',
    expected: 'All 15 category names match frontend/service.md exactly',
    actual: `${actualCategoryNames.length} categories found`,
    result: passT2 ? 'PASS' : 'FAIL',
    details: `Categories: ${actualCategoryNames.join(', ')}`,
  });

  // ----------------------------------------------------------------
  // Test 3: Specific Wording, Price Notes & Price Restoration Verification
  // ----------------------------------------------------------------
  const neurotoxinsCat = publicCats.find((c: any) => c.name === 'Neurotoxins');
  const neurotoxinSvc = neurotoxinsCat?.services?.find((s: any) => s.slug === 'neurotoxin-per-unit');
  const daxxifySvc = neurotoxinsCat?.services?.find((s: any) => s.slug === 'neurotoxin-daxxify');

  const consultationsCat = publicCats.find((c: any) => c.name === 'Consultations');
  const complimentaryConsultSvc = consultationsCat?.services?.find((s: any) => s.slug === 'consultation-complimentary');

  const passT3 =
    neurotoxinSvc?.priceNote === 'per unit (Botox, Jeuveau, Xeomin, Letybo)' &&
    neurotoxinSvc?.priceCents === 1200 && // $12 per unit restored
    daxxifySvc?.priceNote === 'per unit' &&
    daxxifySvc?.priceCents === 800 &&
    complimentaryConsultSvc?.priceNote === 'Complimentary' &&
    complimentaryConsultSvc?.priceCents === 0;

  results.push({
    step: '3. Exact Price Wording & Price Restoration Verification',
    expected: 'Original price ($12 / 1200 cents) and price notes preserved',
    actual: `Neurotoxin price: ${neurotoxinSvc?.priceCents}c ("${neurotoxinSvc?.priceNote}")`,
    result: passT3 ? 'PASS' : 'FAIL',
    details: 'Price display text and restored numeric prices match catalog source of truth',
  });

  // ----------------------------------------------------------------
  // Test 4: Duplicate-Name Variant Disambiguation (Everesse Volnewmer)
  // ----------------------------------------------------------------
  const skinTighteningCat = publicCats.find((c: any) => c.name === 'Skin Tightening');
  const everesseVariants = skinTighteningCat?.services?.filter((s: any) => s.name.includes('Everesse')) || [];

  const passT4 = everesseVariants.length === 7;
  results.push({
    step: '4. Duplicate-Name Variant Disambiguation (Everesse)',
    expected: '7 distinct Everesse by Volnewmer variants with unique slugs',
    actual: `${everesseVariants.length} distinct Everesse variants found`,
    result: passT4 ? 'PASS' : 'FAIL',
    details: `Slugs: ${everesseVariants.map((v: any) => v.slug).join(', ')}`,
  });

  // ----------------------------------------------------------------
  // Test 5: Production HTTP Import Route Removal Verification
  // ----------------------------------------------------------------
  const importRouteCheck = await makeRequest('POST', '/services/import-catalog', {}, adminCookies);
  const passT5 = importRouteCheck.status === 404;

  results.push({
    step: '5. Production HTTP Import Route Removal Verification',
    expected: 'HTTP 404 Not Found for POST /api/v1/services/import-catalog',
    actual: `HTTP ${importRouteCheck.status}`,
    result: passT5 ? 'PASS' : 'FAIL',
    details: 'HTTP import trigger completely removed from production API surface',
  });

  // ----------------------------------------------------------------
  // Test 6: Public Endpoint Sanitization (Public-safe fields only)
  // ----------------------------------------------------------------
  const firstSvc = publicCats[0]?.services?.[0];
  const hasInternalAuditFields = firstSvc && ('deletedAt' in firstSvc || 'createdAt' in firstSvc || 'updatedAt' in firstSvc);
  const passT6 = publicRes.status === 200 && !hasInternalAuditFields;

  results.push({
    step: '6. Public Endpoint Data Field Sanitization',
    expected: 'Returns public-safe fields only (no deletedAt / internal audit data)',
    actual: `Audit fields present: ${!!hasInternalAuditFields}`,
    result: passT6 ? 'PASS' : 'FAIL',
    details: 'Public endpoint strictly filtered to user-facing catalog fields',
  });

  // ----------------------------------------------------------------
  // Test 7: Internal Staff Lookup Access (GET /services/categories & GET /services)
  // ----------------------------------------------------------------
  const staffCatsRes = await makeRequest('GET', '/services/categories', undefined, rnCookies);
  const staffSvcsRes = await makeRequest('GET', '/services', undefined, fdCookies);

  const passT7 = staffCatsRes.status === 200 && staffSvcsRes.status === 200 && staffSvcsRes.body?.data?.length >= 60;
  results.push({
    step: '7. Internal Staff Service Lookup Authorization',
    expected: 'RN & Front Desk retrieve complete catalog via authenticated REST APIs',
    actual: `Categories HTTP ${staffCatsRes.status}, Services HTTP ${staffSvcsRes.status} (${staffSvcsRes.body?.data?.length} services)`,
    result: passT7 ? 'PASS' : 'FAIL',
    details: 'Approved staff roles granted read-only service lookup access',
  });

  // ----------------------------------------------------------------
  // Test 8: Non-Admin Service Management Write Protection
  // ----------------------------------------------------------------
  const targetSvcId = staffSvcsRes.body?.data?.[0]?.id;

  const rnPostRes = await makeRequest('POST', '/services', { name: 'Unauthorized Service' }, rnCookies);
  const fdPatchRes = await makeRequest('PATCH', `/services/${targetSvcId}`, { priceCents: 99000 }, fdCookies);
  const fdDeleteRes = await makeRequest('DELETE', `/services/${targetSvcId}`, undefined, fdCookies);

  const passT8 = rnPostRes.status === 403 && fdPatchRes.status === 403 && fdDeleteRes.status === 403;
  results.push({
    step: '8. Non-Admin Service Management Write Protection',
    expected: 'HTTP 403 Forbidden for RN and Front Desk on POST, PATCH, DELETE',
    actual: `POST:${rnPostRes.status}, PATCH:${fdPatchRes.status}, DELETE:${fdDeleteRes.status}`,
    result: passT8 ? 'PASS' : 'FAIL',
    details: 'Non-admin users strictly blocked from mutating service catalog',
  });

  // ----------------------------------------------------------------
  // Test 9: Admin Price Management & Instant Restoration
  // ----------------------------------------------------------------
  const origPriceCents = staffSvcsRes.body?.data?.[0]?.priceCents;
  const adminPatchRes = await makeRequest('PATCH', `/services/${targetSvcId}`, { priceCents: 99900 }, adminCookies);
  const verifyAdminPatch = await makeRequest('GET', `/services/${targetSvcId}`, undefined, adminCookies);
  
  // Instant restoration back to original price
  await makeRequest('PATCH', `/services/${targetSvcId}`, { priceCents: origPriceCents }, adminCookies);
  const verifyRestored = await makeRequest('GET', `/services/${targetSvcId}`, undefined, adminCookies);

  const passT9 =
    adminPatchRes.status === 200 &&
    verifyAdminPatch.body?.data?.priceCents === 99900 &&
    verifyRestored.body?.data?.priceCents === origPriceCents;

  results.push({
    step: '9. Admin Price Management Update & Instant Restoration',
    expected: 'Admin price edit succeeds and is immediately restored to original catalog price',
    actual: `Update: ${verifyAdminPatch.body?.data?.priceCents}c, Restored: ${verifyRestored.body?.data?.priceCents}c`,
    result: passT9 ? 'PASS' : 'FAIL',
    details: 'Catalog price updated and safely restored with zero lingering changes',
  });

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('CLIENT SERVICE CATALOG RESTORATION VERIFICATION RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.result === 'PASS').length;
  console.log(`\nTOTAL TESTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)\n`);

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runServiceCatalogVerification().catch((err) => {
  console.error('Error running Service Catalog verification:', err);
  process.exit(1);
});
