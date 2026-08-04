// Radiantilyk EMR — Database Seed Script
// Seeds initial roles, permissions, staff profiles, patient profiles, and 5 primary users.
// Run: npx tsx prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'admin', description: 'Full system administrator — staff management, settings, billing, reports' },
  { name: 'medical_director', description: 'Supervising physician — clinical oversight, SOAP note cosign, provider approval' },
  { name: 'nurse_practitioner', description: 'Clinical provider — patient treatments, encounters, SOAP notes, prescriptions' },
  { name: 'rn_injector', description: 'RN / Injector — clinical notes, perform treatments, submit for MD/NP cosign' },
  { name: 'privacy_officer', description: 'Privacy & Security Officer — HIPAA policies, audit logs, breach reports, compliance' },
  { name: 'front_desk', description: 'Front Desk / Scheduler — appointment booking, patient check-in, calendar management' },
  { name: 'patient', description: 'Patient portal access — own records, appointments, consents' },
];

const PERMISSIONS = [
  // Patient Management
  { code: 'patients:read', description: 'View patient profiles' },
  { code: 'patients:write', description: 'Create and edit patient profiles' },
  { code: 'patients:delete', description: 'Soft-delete patient records' },
  { code: 'patients:export', description: 'Export patient data (chart, ZIP)' },

  // Clinical
  { code: 'encounters:read', description: 'View encounters' },
  { code: 'encounters:write', description: 'Create and edit encounters' },
  { code: 'soap_notes:read', description: 'View SOAP notes' },
  { code: 'soap_notes:write', description: 'Create and edit SOAP notes' },
  { code: 'soap_notes:cosign', description: 'Cosign SOAP notes (MD only)' },
  { code: 'soap_notes:lock', description: 'Lock finalized notes' },

  // Appointments
  { code: 'appointments:read', description: 'View appointments' },
  { code: 'appointments:write', description: 'Create and edit appointments' },
  { code: 'appointments:cancel', description: 'Cancel appointments' },

  // Inventory
  { code: 'inventory:read', description: 'View inventory and lots' },
  { code: 'inventory:write', description: 'Manage inventory, receive lots' },

  // Payments
  { code: 'payments:read', description: 'View payment records' },
  { code: 'payments:process', description: 'Process payments and refunds' },

  // Compliance
  { code: 'audit_logs:read', description: 'View audit logs' },
  { code: 'breach_reports:read', description: 'View breach reports' },
  { code: 'breach_reports:write', description: 'Create and manage breach reports' },
  { code: 'policies:read', description: 'View compliance policies' },
  { code: 'policies:write', description: 'Create and edit policies' },

  // Admin
  { code: 'users:read', description: 'View user accounts' },
  { code: 'users:write', description: 'Create and manage user accounts' },
  { code: 'roles:manage', description: 'Assign and revoke roles' },
  { code: 'settings:manage', description: 'Manage system settings' },

  // Services
  { code: 'services:read', description: 'View services catalog' },
  { code: 'services:write', description: 'Create and edit services' },

  // Consents
  { code: 'consents:read', description: 'View consent templates and signatures' },
  { code: 'consents:write', description: 'Create and manage consent templates' },
];

// Role → Permission mappings
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: PERMISSIONS.map(p => p.code),
  medical_director: [
    'patients:read', 'patients:write', 'patients:export',
    'encounters:read', 'encounters:write',
    'soap_notes:read', 'soap_notes:write', 'soap_notes:cosign', 'soap_notes:lock',
    'appointments:read', 'appointments:write',
    'inventory:read',
    'payments:read',
    'consents:read',
    'services:read',
  ],
  nurse_practitioner: [
    'patients:read', 'patients:write',
    'encounters:read', 'encounters:write',
    'soap_notes:read', 'soap_notes:write',
    'appointments:read', 'appointments:write',
    'inventory:read', 'inventory:write',
    'payments:read', 'payments:process',
    'consents:read', 'consents:write',
    'services:read',
  ],
  rn_injector: [
    'patients:read', 'patients:write',
    'encounters:read', 'encounters:write',
    'soap_notes:read', 'soap_notes:write',
    'appointments:read', 'appointments:write',
    'inventory:read', 'inventory:write',
    'payments:read',
    'consents:read',
    'services:read',
  ],
  privacy_officer: [
    'patients:read', 'patients:export',
    'audit_logs:read',
    'breach_reports:read', 'breach_reports:write',
    'policies:read', 'policies:write',
    'users:read',
  ],
  front_desk: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write', 'appointments:cancel',
    'payments:read', 'payments:process',
    'consents:read',
    'services:read',
  ],
  patient: [],
};

const USERS_TO_SEED = [
  {
    email: 'admin@gmail.com',
    role: 'admin',
    firstName: 'System',
    lastName: 'Admin',
    isStaff: true,
    title: 'Administrator',
  },
  {
    email: 'medicaldirector@gmail.com',
    role: 'medical_director',
    firstName: 'Dr. Sarah',
    lastName: 'Jenkins, MD',
    isStaff: true,
    title: 'Medical Director',
  },
  {
    email: 'securityofficer@gmail.com',
    role: 'privacy_officer',
    firstName: 'Robert',
    lastName: 'Vance',
    isStaff: true,
    title: 'Security & Compliance Officer',
  },
  {
    email: 'staff@gmail.com',
    role: 'front_desk',
    firstName: 'Jessica',
    lastName: 'Taylor',
    isStaff: true,
    title: 'Front Desk Coordinator',
  },
  {
    email: 'user@gmail.com',
    role: 'patient',
    firstName: 'Jane',
    lastName: 'Doe',
    isStaff: false,
    phone: '555-019-2831',
  },
];

async function seed() {
  console.log('🌱 Seeding database...');

  // ---- Create Roles ----
  console.log('  Creating roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log(`  ✅ ${ROLES.length} roles created`);

  // ---- Create Permissions ----
  console.log('  Creating permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`  ✅ ${PERMISSIONS.length} permissions created`);

  // ---- Assign Role Permissions ----
  console.log('  Assigning role permissions...');
  for (const [roleName, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const code of permCodes) {
      const permission = await prisma.permission.findUnique({ where: { code } });
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log('  ✅ Role permissions assigned');

  // ---- Create Real Users ----
  console.log('  Creating 5 core users...');
  const passwordHash = await bcrypt.hash('12345678', 10);

  for (const userInfo of USERS_TO_SEED) {
    const user = await prisma.user.upsert({
      where: { email: userInfo.email },
      update: { passwordHash },
      create: {
        email: userInfo.email,
        passwordHash,
        isActive: true,
        mfaEnabled: false,
      },
    });

    // Assign Role (Clear existing roles first to prevent stale role accumulation)
    const roleObj = await prisma.role.findUnique({ where: { name: userInfo.role } });
    if (roleObj) {
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleObj.id },
      });
    }

    // Create Staff / Patient Profile
    if (userInfo.isStaff) {
      await prisma.staffProfile.upsert({
        where: { userId: user.id },
        update: { fullName: `${userInfo.firstName} ${userInfo.lastName}`, title: userInfo.title, email: userInfo.email },
        create: {
          userId: user.id,
          email: userInfo.email,
          fullName: `${userInfo.firstName} ${userInfo.lastName}`,
          title: userInfo.title,
          licenseNumber: `LIC-${Math.floor(100000 + Math.random() * 900000)}`,
          npiNumber: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        },
      });
    } else {
      await prisma.patientProfile.upsert({
        where: { userId: user.id },
        update: { firstName: userInfo.firstName, lastName: userInfo.lastName },
        create: {
          userId: user.id,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          phone: userInfo.phone,
          dateOfBirth: new Date('1992-05-15'),
        },
      });
    }

    console.log(`  ✅ User seeded: ${userInfo.email} (${userInfo.role})`);
  }

  console.log('🌱 Seed complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
