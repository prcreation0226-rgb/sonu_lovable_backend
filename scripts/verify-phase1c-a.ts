/**
 * Phase 1C-A Live Backend RBAC Verification Script
 * Tests live Railway MySQL authorization rules.
 */

const API_BASE = 'https://sonulovablebackend-production.up.railway.app/api/v1';
const TEST_EMAIL = 'phase1-test@radiantilyk.com';
const TEST_PASSWORD = 'Phase1Test!2026';

async function run() {
  console.log('=== PHASE 1C-A LIVE RBAC VERIFICATION ===\n');

  // 1. Login with test account
  console.log(`1. Logging in as ${TEST_EMAIL}...`);
  const loginResp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  console.log(`Login HTTP Status: ${loginResp.status}`);
  const cookies = loginResp.headers.get('set-cookie') || '';

  // 2. Fetch User Profile & Roles
  console.log('\n2. Fetching active roles via GET /auth/me...');
  const meResp = await fetch(`${API_BASE}/auth/me`, {
    headers: { cookie: cookies },
  });
  const meData = (await meResp.json()) as any;
  console.log(`User ID: ${meData?.data?.user?.id}`);
  console.log(`Active Live Roles: ${JSON.stringify(meData?.data?.user?.roles)}`);

  // 3. Test MD-Only Clinical Reviews Endpoint
  console.log('\n3. Testing GET /clinical/reviews (MD-Only restriction)...');
  const reviewsResp = await fetch(`${API_BASE}/clinical/reviews`, {
    headers: { cookie: cookies },
  });
  console.log(`Clinical Reviews Status: ${reviewsResp.status} (Expected 403 if user lacks medical_director role)`);

  // 4. Test MD-Only Prescription Issue Endpoint
  console.log('\n4. Testing POST /clinical/prescriptions (MD-Only restriction)...');
  const rxResp = await fetch(`${API_BASE}/clinical/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookies },
    body: JSON.stringify({ patient_id: 'p-1', medication: 'Botox 100u' }),
  });
  console.log(`Prescription Status: ${rxResp.status} (Expected 403 if user lacks medical_director role)`);

  // 5. Test Staff Write Endpoint
  console.log('\n5. Testing Staff Profile Write Endpoint POST /staff...');
  const staffWriteResp = await fetch(`${API_BASE}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookies },
    body: JSON.stringify({ email: 'test@example.com' }),
  });
  console.log(`Staff Write Status: ${staffWriteResp.status}`);

  console.log('\n=== PHASE 1C-A VERIFICATION COMPLETED ===');
}

run().catch(console.error);
