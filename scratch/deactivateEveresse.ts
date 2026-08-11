import { prisma } from '../src/config/database';

async function main() {
  console.log("Searching for services containing 'Everesse' in DB...");
  const services = await prisma.service.findMany({
    where: {
      name: {
        contains: 'Everesse',
      },
    },
  });

  console.log(`Found ${services.length} services matching 'Everesse':`);
  for (const s of services) {
    console.log(`- ID: ${s.id} | Name: ${s.name} | isActive: ${s.isActive}`);
  }

  const updated = await prisma.service.updateMany({
    where: {
      name: {
        contains: 'Everesse',
      },
    },
    data: {
      isActive: false,
    },
  });

  console.log(`Updated ${updated.count} services to isActive: false.`);

  // Also search case-insensitively or by promoGroup or description if any
  const servicesByDesc = await prisma.service.findMany({
    where: {
      OR: [
        { description: { contains: 'Everesse' } },
        { promoGroup: { contains: 'everesse' } },
      ],
    },
  });

  if (servicesByDesc.length > 0) {
    console.log(`Found ${servicesByDesc.length} additional services by description/promoGroup:`);
    for (const s of servicesByDesc) {
      console.log(`- ID: ${s.id} | Name: ${s.name} | isActive: ${s.isActive}`);
    }
    const updatedDesc = await prisma.service.updateMany({
      where: {
        OR: [
          { description: { contains: 'Everesse' } },
          { promoGroup: { contains: 'everesse' } },
        ],
      },
      data: {
        isActive: false,
      },
    });
    console.log(`Updated ${updatedDesc.count} additional services to isActive: false.`);
  }

  // Also query raw SQL in case table is accessed directly
  const rawResults: any = await prisma.$queryRaw`SELECT id, name, is_active FROM services WHERE name LIKE '%Everesse%' OR description LIKE '%Everesse%' OR promo_group LIKE '%everesse%'`;
  console.log("Current DB status after update:", rawResults);
}

main()
  .catch((e) => {
    console.error("Error executing script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
