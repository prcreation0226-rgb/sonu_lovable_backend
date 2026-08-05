// Radiantilyk EMR — Client Service Catalog Import Script
// CLI wrapper to invoke importServiceCatalog against MySQL database.

import { importServiceCatalog } from '../src/services/catalog.service';

if (require.main === module) {
  importServiceCatalog()
    .then(() => {
      console.log('Service catalog restoration finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Service catalog restoration failed:', err);
      process.exit(1);
    });
}
