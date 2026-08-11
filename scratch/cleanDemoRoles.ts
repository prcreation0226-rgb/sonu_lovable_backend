import { prisma } from '../src/config/database';

async function main() {
  const email = 'demo@gmail.com';
  let user = await prisma.user.findFirst({ where: { email } });
  if (user) {
    let patientRole = await prisma.role.findFirst({ where: { name: 'patient' } });
    if (!patientRole) {
      patientRole = await prisma.role.create({ data: { name: 'patient', description: 'Patient Role' } });
    }

    // Remove staff/admin roles from demo@gmail.com, keep ONLY 'patient'
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: patientRole.id,
      },
    });

    console.log(`Cleaned roles for ${email} — now ONLY 'patient'`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
