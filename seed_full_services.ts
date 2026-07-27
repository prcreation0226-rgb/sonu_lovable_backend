import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface ParsedService {
  name: string;
  priceCents: number | null;
  priceNote: string | null;
  description: string;
  durationMinutes: number;
}

interface ParsedCategory {
  order: number;
  name: string;
  description: string;
  services: ParsedService[];
}

function parseServiceMd(filePath: string): ParsedCategory[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim());

  const categories: ParsedCategory[] = [];
  let currentCategory: ParsedCategory | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if category header e.g. "1.   Consultations" or "2. Neurotoxins"
    const catMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (catMatch) {
      const catOrder = parseInt(catMatch[1]);
      const catName = catMatch[2].trim();
      let catDesc = '';
      i++;

      // Next line might be category description
      if (i < lines.length && lines[i] && !lines[i].includes('services') && !lines[i].match(/^\d+\./)) {
        catDesc = lines[i];
        i++;
      }

      // Next line is e.g. "2 services"
      if (i < lines.length && lines[i].includes('services')) {
        i++;
      }

      currentCategory = {
        order: catOrder,
        name: catName,
        description: catDesc,
        services: [],
      };
      categories.push(currentCategory);
      continue;
    }

    // Parse service inside category
    if (currentCategory && line && !line.includes('services')) {
      const name = line;
      i++;

      let priceCents: number | null = null;
      let priceNote: string | null = null;

      if (i < lines.length && lines[i].startsWith('$')) {
        const priceStr = lines[i];
        if (priceStr.toLowerCase().includes('complimentary')) {
          priceCents = 0;
          priceNote = 'Complimentary';
        } else {
          const numMatch = priceStr.match(/\$(\d[\d,]*)/);
          if (numMatch) {
            priceCents = parseInt(numMatch[1].replace(/,/g, '')) * 100;
          }
          priceNote = priceStr;
        }
        i++;
      } else if (i < lines.length && lines[i].toLowerCase() === 'complimentary') {
        priceCents = 0;
        priceNote = 'Complimentary';
        i++;
      }

      // Check for price note line if it wasn't captured or has additional subtext
      if (i < lines.length && (lines[i].includes('per') || lines[i].includes('initial') || lines[i].includes('includes') || lines[i].includes('eval') || lines[i].includes('session') || lines[i].includes('treatment') || lines[i].includes('add-on'))) {
        if (!priceNote) priceNote = lines[i];
        else if (lines[i] !== priceNote) priceNote = `${priceNote} • ${lines[i]}`;
        i++;
      }

      let description = '';
      if (i < lines.length && lines[i] && !lines[i].match(/\d+\s*min$/i)) {
        description = lines[i];
        i++;
      }

      let durationMinutes = 30;
      if (i < lines.length && lines[i].match(/\d+\s*min$/i)) {
        const durMatch = lines[i].match(/(\d+)\s*min$/i);
        if (durMatch) {
          durationMinutes = parseInt(durMatch[1]);
        }
        i++;
      }

      currentCategory.services.push({
        name,
        priceCents,
        priceNote,
        description,
        durationMinutes,
      });
      continue;
    }

    i++;
  }

  return categories;
}

async function main() {
  console.log('🌱 Seeding Full Service Catalog from service.md into MySQL Database...');

  const mdPath = path.join(__dirname, '../frontend/service.md');
  const parsedCategories = parseServiceMd(mdPath);

  // Get or Create default Location
  let location = await prisma.location.findFirst({ where: { deletedAt: null } });
  if (!location) {
    location = await prisma.location.create({
      data: {
        name: 'San Jose Studio',
        slug: 'san-jose',
        address: '2100 Curtner Ave, Ste 1B, San Jose, CA 95124',
        phone: '(408) 351-1873',
      },
    });
  }

  // Get all staff profiles
  const staffList = await prisma.staffProfile.findMany({ where: { deletedAt: null } });

  for (const catData of parsedCategories) {
    console.log(`\n📂 Category [${catData.order}]: ${catData.name} (${catData.services.length} services)`);

    const category = await prisma.serviceCategory.upsert({
      where: { id: `cat-md-${catData.order}` },
      update: {
        name: catData.name,
        description: catData.description,
        displayOrder: catData.order,
        isActive: true,
      },
      create: {
        id: `cat-md-${catData.order}`,
        name: catData.name,
        description: catData.description,
        displayOrder: catData.order,
        isActive: true,
      },
    });

    for (let sIdx = 0; sIdx < catData.services.length; sIdx++) {
      const s = catData.services[sIdx];
      const serviceSlug = `svc-${catData.order}-${sIdx + 1}`;

      const service = await prisma.service.upsert({
        where: { id: `svc-id-${catData.order}-${sIdx + 1}` },
        update: {
          categoryId: category.id,
          name: s.name,
          slug: serviceSlug,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          priceNote: s.priceNote,
          isActive: true,
        },
        create: {
          id: `svc-id-${catData.order}-${sIdx + 1}`,
          categoryId: category.id,
          name: s.name,
          slug: serviceSlug,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          priceNote: s.priceNote,
          isActive: true,
        },
      });

      console.log(`   - Added Service: ${service.name} ($${((service.priceCents ?? 0) / 100).toFixed(0)}, ${service.durationMinutes} min)`);

      // Connect to Location
      await prisma.serviceLocation.upsert({
        where: {
          serviceId_locationId: { serviceId: service.id, locationId: location.id },
        },
        update: {},
        create: {
          serviceId: service.id,
          locationId: location.id,
        },
      });

      // Connect to Staff
      for (const st of staffList) {
        await prisma.providerService.upsert({
          where: {
            staffId_serviceId: { staffId: st.id, serviceId: service.id },
          },
          update: {},
          create: {
            staffId: st.id,
            serviceId: service.id,
          },
        });
      }
    }
  }

  console.log('\n✅ Successfully seeded all 15 categories and services into MySQL Database!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
