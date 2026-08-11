import { prisma } from './config/database';

async function main() {
  console.log('--- CHECKING EVERESSE SERVICES IN LIVE DB ---');
  const everesseServices = await prisma.service.findMany({
    where: {
      OR: [
        { name: { contains: 'Everesse' } },
        { name: { contains: 'Volnewmer' } },
        { name: { contains: 'everesse' } },
      ],
    },
  });

  console.log(`Found ${everesseServices.length} Everesse service(s) in DB:`);
  everesseServices.forEach(s => {
    console.log(`- ID: ${s.id} | Name: "${s.name}" | isActive: ${s.isActive}`);
  });

  if (everesseServices.length > 0) {
    console.log('Deactivating all Everesse services in DB...');
    const result = await prisma.service.updateMany({
      where: {
        OR: [
          { name: { contains: 'Everesse' } },
          { name: { contains: 'Volnewmer' } },
          { name: { contains: 'everesse' } },
        ],
      },
      data: {
        isActive: false,
      },
    });
    console.log(`Deactivated ${result.count} record(s).`);
  }

  // Verify active Everesse count in DB
  const activeCount = await prisma.service.count({
    where: {
      OR: [
        { name: { contains: 'Everesse' } },
        { name: { contains: 'Volnewmer' } },
        { name: { contains: 'everesse' } },
      ],
      isActive: true,
    },
  });

  console.log(`Active Everesse services remaining in DB: ${activeCount}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
