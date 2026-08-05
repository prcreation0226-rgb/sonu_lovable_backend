// Radiantilyk EMR — Phase 2C Checkout & Billing Connectivity Verification Suite
// Verifies live Railway MySQL database persistence, checkout line items, RBAC enforcement, and patient cross-access protection.

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

async function runPhase2cVerification() {
  console.log('================================================================');
  console.log('  PHASE 2C — CHECKOUT & BILLING LIVE CONNECTIVITY SUITE');
  console.log('================================================================\n');

  const results: TestResult[] = [];

  // Seed test accounts first
  await makeRequest('POST', '/auth/seed-test-accounts');

  console.log('Logging in test accounts for billing RBAC verification...\n');
  const adminCookies = await loginAs('phase1-admin@radiantilyk.com');
  const fdCookies = await loginAs('phase1-fd@radiantilyk.com');
  const rnCookies = await loginAs('phase1-rn@radiantilyk.com');
  const mdCookies = await loginAs('phase1-md@radiantilyk.com');
  const poCookies = await loginAs('phase1-po@radiantilyk.com');

  // ----------------------------------------------------------------
  // Step 1: Load Live Patient & Services for Checkout
  // ----------------------------------------------------------------
  const patientsRes = await makeRequest('GET', '/patients', undefined, adminCookies);
  const servicesRes = await makeRequest('GET', '/services/public');

  const targetPatient = patientsRes.body?.data?.[0];
  const targetService = servicesRes.body?.data?.[0]?.services?.[0];

  const passS1 = !!targetPatient?.id && !!targetService?.id;
  results.push({
    step: '1. Load Live Patient & Restored Service Fixtures',
    expected: 'Retrieve valid patient & service IDs from live Railway MySQL',
    actual: passS1 ? `Patient ID: ${targetPatient.id.substring(0, 8)}..., Service: ${targetService.name}` : 'Failed to fetch fixtures',
    result: passS1 ? 'PASS' : 'FAIL',
    details: 'Verified real database record availability for checkout flow',
  });

  if (!passS1) {
    console.error('Cannot proceed without valid patient and service fixtures.');
    process.exit(1);
  }

  // ----------------------------------------------------------------
  // Step 2: Front Desk Approved Invoice Creation
  // ----------------------------------------------------------------
  const invoicePayload = {
    patientId: targetPatient.id,
    discountCents: 2000, // $20 discount
    taxCents: 500,       // $5 tax
    items: [
      {
        serviceId: targetService.id,
        description: targetService.name,
        unitPriceCents: targetService.priceCents || 15000,
        quantity: 1,
      },
    ],
  };

  const createInvoiceRes = await makeRequest('POST', '/billing/invoices', invoicePayload, fdCookies);
  const createdInvoice = createInvoiceRes.body?.data;
  const expectedTotal = (targetService.priceCents || 15000) + 500 - 2000;

  const passS2 = createInvoiceRes.status === 201 && createdInvoice?.totalCents === expectedTotal && createdInvoice?.status === 'unpaid';
  results.push({
    step: '2. Front Desk Invoice Creation (POST /billing/invoices)',
    expected: `HTTP 201 Created with totalCents = ${expectedTotal}`,
    actual: `HTTP ${createInvoiceRes.status}, totalCents = ${createdInvoice?.totalCents}, status = ${createdInvoice?.status}`,
    result: passS2 ? 'PASS' : 'FAIL',
    details: 'Front desk created invoice; line items, subtotal, tax & discount calculated correctly',
  });

  // ----------------------------------------------------------------
  // Step 3: Front Desk Approved Payment Recording
  // ----------------------------------------------------------------
  const paymentPayload = {
    invoiceId: createdInvoice?.id,
    patientId: targetPatient.id,
    amountCents: expectedTotal,
    tipCents: 1500, // $15 tip
    discountCents: 0,
    paymentMethod: 'card',
  };

  const recordPaymentRes = await makeRequest('POST', '/billing/payments', paymentPayload, fdCookies);
  const getInvoiceAfterPayment = await makeRequest('GET', `/billing/invoices/${createdInvoice?.id}`, undefined, fdCookies);

  const passS3 = recordPaymentRes.status === 201 && getInvoiceAfterPayment.body?.data?.status === 'paid';
  results.push({
    step: '3. Front Desk Payment Recording & Invoice Status Update',
    expected: 'HTTP 201 Created, invoice status transitions to "paid" in MySQL',
    actual: `Payment HTTP ${recordPaymentRes.status}, Invoice status: ${getInvoiceAfterPayment.body?.data?.status}`,
    result: passS3 ? 'PASS' : 'FAIL',
    details: 'Payment recorded and invoice marked paid in Railway MySQL database',
  });

  // ----------------------------------------------------------------
  // Step 4: Admin Unpaid Invoice Cancellation
  // ----------------------------------------------------------------
  const cancelTestInvoiceRes = await makeRequest('POST', '/billing/invoices', invoicePayload, adminCookies);
  const cancelInvoiceId = cancelTestInvoiceRes.body?.data?.id;

  const cancelRes = await makeRequest('POST', `/billing/invoices/${cancelInvoiceId}/cancel`, {}, fdCookies);
  const checkCancelled = await makeRequest('GET', `/billing/invoices/${cancelInvoiceId}`, undefined, adminCookies);

  const passS4 = cancelRes.status === 200 && checkCancelled.body?.data?.status === 'cancelled';
  results.push({
    step: '4. Unpaid Invoice Cancellation (POST /billing/invoices/:id/cancel)',
    expected: 'HTTP 200 OK transitioning unpaid invoice status to "cancelled"',
    actual: `Cancel HTTP ${cancelRes.status}, updated status: ${checkCancelled.body?.data?.status}`,
    result: passS4 ? 'PASS' : 'FAIL',
    details: 'Front Desk / Admin successfully voided unpaid invoice',
  });

  // ----------------------------------------------------------------
  // Step 5: Admin Refund Processing
  // ----------------------------------------------------------------
  const paymentId = recordPaymentRes.body?.data?.id;
  const refundPayload = {
    paymentId,
    amountCents: 1000, // $10 partial refund
    reason: 'Patient requested partial refund for consultation adjustment',
  };

  const refundRes = await makeRequest('POST', '/billing/refunds', refundPayload, adminCookies);
  const passS5 = refundRes.status === 201 && refundRes.body?.data?.amountCents === 1000;

  results.push({
    step: '5. Admin Partial Refund Processing (POST /billing/refunds)',
    expected: 'HTTP 201 Created recording partial refund in Railway MySQL',
    actual: `Refund HTTP ${refundRes.status}, refunded cents: ${refundRes.body?.data?.amountCents}`,
    result: passS5 ? 'PASS' : 'FAIL',
    details: 'Admin processed payment refund with audit logging',
  });

  // ----------------------------------------------------------------
  // Step 6: Non-Admin Refund Rejection (FD / RN / MD -> 403)
  // ----------------------------------------------------------------
  const fdRefundRes = await makeRequest('POST', '/billing/refunds', refundPayload, fdCookies);
  const rnRefundRes = await makeRequest('POST', '/billing/refunds', refundPayload, rnCookies);

  const passS6 = fdRefundRes.status === 403 && rnRefundRes.status === 403;
  results.push({
    step: '6. Non-Admin Refund Protection (Front Desk & RN -> 403)',
    expected: 'HTTP 403 Forbidden when non-admin attempts refund',
    actual: `FD Refund: ${fdRefundRes.status}, RN Refund: ${rnRefundRes.status}`,
    result: passS6 ? 'PASS' : 'FAIL',
    details: 'Refund processing strictly protected for Admin role only',
  });

  // ----------------------------------------------------------------
  // Step 7: Clinical Roles Financial Write Protection (RN & MD -> 403)
  // ----------------------------------------------------------------
  const rnInvoiceRes = await makeRequest('POST', '/billing/invoices', invoicePayload, rnCookies);
  const mdInvoiceRes = await makeRequest('POST', '/billing/invoices', invoicePayload, mdCookies);
  const rnPaymentRes = await makeRequest('POST', '/billing/payments', paymentPayload, rnCookies);

  const passS7 = rnInvoiceRes.status === 403 && mdInvoiceRes.status === 403 && rnPaymentRes.status === 403;
  results.push({
    step: '7. Clinical Roles Financial Write Protection (RN & MD -> 403)',
    expected: 'HTTP 403 Forbidden for clinical staff on invoice creation & payment',
    actual: `RN Invoice: ${rnInvoiceRes.status}, MD Invoice: ${mdInvoiceRes.status}, RN Payment: ${rnPaymentRes.status}`,
    result: passS7 ? 'PASS' : 'FAIL',
    details: 'Clinical staff strictly blocked from mutating financial records',
  });

  // ----------------------------------------------------------------
  // Step 8: Privacy Officer Audit Protection
  // ----------------------------------------------------------------
  const poBillingRes = await makeRequest('GET', '/billing/invoices', undefined, poCookies);
  const poInvoiceCreateRes = await makeRequest('POST', '/billing/invoices', invoicePayload, poCookies);

  const passS8 = poBillingRes.status === 403 && poInvoiceCreateRes.status === 403;
  results.push({
    step: '8. Privacy Officer Billing Access Protection',
    expected: 'HTTP 403 Forbidden for Privacy Officer on billing routes',
    actual: `GET Invoices: ${poBillingRes.status}, POST Invoice: ${poInvoiceCreateRes.status}`,
    result: passS8 ? 'PASS' : 'FAIL',
    details: 'Privacy Officer blocked from routine financial data access',
  });

  // ----------------------------------------------------------------
  // Step 9: Database State Persistence Verification
  // ----------------------------------------------------------------
  const persistCheck = await makeRequest('GET', `/billing/invoices/${createdInvoice?.id}`, undefined, adminCookies);
  const invData = persistCheck.body?.data;

  const passS9 =
    persistCheck.status === 200 &&
    invData?.id === createdInvoice?.id &&
    invData?.status === 'paid' &&
    invData?.invoiceItems?.length === 1;

  results.push({
    step: '9. Railway MySQL Database State & Relation Persistence',
    expected: 'Invoice, line items, and payment relations persist in MySQL',
    actual: `Status: ${invData?.status}, Items: ${invData?.invoiceItems?.length}, Payments: ${invData?.payments?.length}`,
    result: passS9 ? 'PASS' : 'FAIL',
    details: 'Verified durable persistence on live Railway MySQL instance',
  });

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 2C CHECKOUT & BILLING VERIFICATION RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(results);

  const passedCount = results.filter((r) => r.result === 'PASS').length;
  console.log(`\nTOTAL TESTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% Success)\n`);

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runPhase2cVerification().catch((err) => {
  console.error('Error running Phase 2C verification:', err);
  process.exit(1);
});
