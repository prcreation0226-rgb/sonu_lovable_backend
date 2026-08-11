import bcrypt from 'bcrypt';
import { prisma } from '../src/config/database';

async function main() {
  const email = 'demo@gmail.com';
  const password = 'RKA-l51z-kouw';
  const hash = await bcrypt.hash(password, 10);

  let role = await prisma.role.findFirst({ where: { name: 'patient' } });
  if (!role) {
    role = await prisma.role.create({ data: { name: 'patient', description: 'Patient Role' } });
  }

  let user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        isActive: true,
        mustChangePassword: false,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        isActive: true,
        deletedAt: null,
        mustChangePassword: false,
      },
    });
  }

  await prisma.userRole.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }).catch(() => {});

  let patient = await prisma.patientProfile.findFirst({ where: { email } });
  if (!patient) {
    await prisma.patientProfile.create({
      data: {
        userId: user.id,
        email,
        firstName: 'Demo',
        lastName: 'Patient',
        phone: '555-0199',
      },
    });
  } else {
    await prisma.patientProfile.update({
      where: { id: patient.id },
      data: { userId: user.id, deletedAt: null },
    });
  }

  console.log(`SUCCESSFULLY UPDATED ${email} WITH PASSWORD: ${password}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
