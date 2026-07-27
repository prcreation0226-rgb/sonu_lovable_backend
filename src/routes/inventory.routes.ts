// Radiantilyk EMR — Inventory & Lot Tracking Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all inventory endpoints.

import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES, CLINICAL_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateProductSchema,
  UpdateProductSchema,
  CreateInventoryLotSchema,
  RecordTreatmentUsageSchema,
  CreateInventoryMovementSchema,
} from '../schemas/inventory.schema';

const router = Router();

// All inventory endpoints require authentication
router.use(authenticate);

// ---- Products ----

router.post(
  '/products',
  requireRoles('admin'),
  validate({ body: CreateProductSchema }),
  InventoryController.createProduct
);

router.get(
  '/products',
  requireRoles(...STAFF_ROLES),
  InventoryController.getProducts
);

router.get(
  '/products/:id',
  requireRoles(...STAFF_ROLES),
  InventoryController.getProductById
);

router.patch(
  '/products/:id',
  requireRoles('admin'),
  validate({ body: UpdateProductSchema }),
  InventoryController.updateProduct
);

router.delete(
  '/products/:id',
  requireRoles('admin'),
  InventoryController.deleteProduct
);

// ---- Inventory Lots ----

router.post(
  '/lots',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: CreateInventoryLotSchema }),
  InventoryController.createLot
);

router.get(
  '/lots',
  requireRoles(...STAFF_ROLES),
  InventoryController.getLots
);

router.get(
  '/lots/expiring',
  requireRoles(...STAFF_ROLES),
  InventoryController.getExpiringLots
);

router.get(
  '/lots/:id',
  requireRoles(...STAFF_ROLES),
  InventoryController.getLotById
);

// ---- Treatment Usage (Clinical lot consumption) ----

router.post(
  '/usage',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: RecordTreatmentUsageSchema }),
  auditPhiAccess('encounter', 'update'),
  InventoryController.recordTreatmentUsage
);

// ---- Inventory Movements ----

router.post(
  '/movements',
  requireRoles('admin', 'medical_director'),
  validate({ body: CreateInventoryMovementSchema }),
  InventoryController.createMovement
);

export default router;
