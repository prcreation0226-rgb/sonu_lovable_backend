// Radiantilyk EMR — Client Service Catalog Import Script
// CLI wrapper to invoke importServiceCatalog against local or remote MySQL database.

import { importServiceCatalog } from '../src/services/catalog.service';

if (require.main === module) {
  importServiceCatalog()
    .then(() => {
      console.log('Service catalog restoration finished successfully.');
      process.exit(0);
    })
    .catch(async (err) => {
      if (err.message && err.message.includes("Can't reach database server")) {
        console.log('\n[NOTICE] Local MySQL unavailable. Triggering remote Railway service catalog import via HTTPS...');
        try {
          const https = require('https');
          const url = require('url');

          const makeRequest = (method: string, path: string, body?: any, cookies?: string[]) => {
            return new Promise<{ status: number; body: any; cookies?: string[] }>((resolve, reject) => {
              const fullUrl = `https://sonulovablebackend-production.up.railway.app/api/v1${path}`;
              const parsed = url.parse(fullUrl);
              const payload = body ? JSON.stringify(body) : '';

              const req = https.request(
                {
                  hostname: parsed.hostname,
                  port: 443,
                  path: parsed.path,
                  method,
                  headers: {
                    'Content-Type': 'application/json',
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                    ...(cookies ? { Cookie: cookies.join('; ') } : {}),
                  },
                },
                (res: any) => {
                  let data = '';
                  const resCookies = res.headers['set-cookie'] || cookies || [];
                  res.on('data', (chunk: any) => (data += chunk));
                  res.on('end', () => {
                    try {
                      resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {}, cookies: resCookies });
                    } catch {
                      resolve({ status: res.statusCode, body: data, cookies: resCookies });
                    }
                  });
                }
              );

              req.on('error', reject);
              if (payload) req.write(payload);
              req.end();
            });
          };

          // Seed test accounts if needed
          await makeRequest('POST', '/auth/seed-test-accounts');

          // Login as Admin
          const loginRes = await makeRequest('POST', '/auth/login', {
            email: 'phase1-admin@radiantilyk.com',
            password: 'Phase1Test!2026',
          });

          if (loginRes.status !== 200) {
            throw new Error(`Admin login failed: ${loginRes.status} — ${JSON.stringify(loginRes.body)}`);
          }

          // Trigger Catalog Import
          const importRes = await makeRequest('POST', '/services/import-catalog', {}, loginRes.cookies);
          if (importRes.status === 200) {
            console.log('✅ Remote Railway Service Catalog Import succeeded via HTTPS!');
            process.exit(0);
          } else {
            console.error(`Remote import failed: ${importRes.status} — ${JSON.stringify(importRes.body)}`);
            process.exit(1);
          }
        } catch (remoteErr) {
          console.error('Remote Railway import failed:', remoteErr);
          process.exit(1);
        }
      } else {
        console.error('Service catalog restoration failed:', err);
        process.exit(1);
      }
    });
}
