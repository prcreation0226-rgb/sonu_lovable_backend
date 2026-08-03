// Radiantilyk EMR — Phase 1A Test Account Creation Script
// Usage: npx tsx scripts/create-phase1-test.ts
//
// Creates a test account safely:
// - Uses bcrypt to hash password (never stored in plaintext)
// - Assigns 'front_desk' role (lowest privilege)
// - Does NOT modify existing accounts
// - Idempotent: skips if account already exists

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TEST_EMAIL = 'phase1-test@radiantilyk.com';
const TEST_PASSWORD = 'Phase1Test!2026';
const TEST_ROLE = 'front_desk';

async function main() {
  console.log('[PHASE1-TEST] Creating test account...');

  // 1. Check if user already exists
  const existing = await prisma.user.findFirst({
    where: { email: TEST_EMAIL },
  });

  if (existing) {
    console.log(`[PHASE1-TEST] User ${TEST_EMAIL} already exists (id: ${existing.id}). Skipping creation.`);
    await prisma.$disconnect();
    return;
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  // 3. Ensure role exists
  let role = await prisma.role.findFirst({ where: { name: TEST_ROLE } });
  if (!role) {
    role = await prisma.role.create({
      data: { name: TEST_ROLE, description: 'Front desk / scheduler role' },
    });
    console.log(`[PHASE1-TEST] Created role: ${TEST_ROLE} (id: ${role.id})`);
  }

  // 4. Create user
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      isActive: true,
    },
  });
  console.log(`[PHASE1-TEST] Created user: ${TEST_EMAIL} (id: ${user.id})`);

  // 5. Assign role
  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
    },
  });
  console.log(`[PHASE1-TEST] Assigned role: ${TEST_ROLE}`);

  console.log('[PHASE1-TEST] ✅ Test account created successfully');
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Role:     ${TEST_ROLE}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[PHASE1-TEST] ❌ Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
