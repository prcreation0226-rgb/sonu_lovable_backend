// Radiantilyk EMR — Inventory & Lot Tracking Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all inventory endpoints.

import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
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

// Approved Client Role Alignment: Admin, Front Desk, MD, NP, RN (Privacy Officer and Patients denied)
const INVENTORY_READ_ROLES = ['admin', 'front_desk', 'medical_director', 'nurse_practitioner', 'rn_injector'] as const;

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
  requireRoles(...INVENTORY_READ_ROLES),
  InventoryController.getProducts
);

router.get(
  '/products/:id',
  requireRoles(...INVENTORY_READ_ROLES),
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

// Strict RBAC Rule: Admin ONLY for lot creation/stock receipt. FD, RN, NP, MD receive 403 Forbidden.
router.post(
  '/lots',
  requireRoles('admin'),
  validate({ body: CreateInventoryLotSchema }),
  InventoryController.createLot
);

router.get(
  '/lots',
  requireRoles(...INVENTORY_READ_ROLES),
  InventoryController.getLots
);

router.get(
  '/lots/expiring',
  requireRoles(...INVENTORY_READ_ROLES),
  InventoryController.getExpiringLots
);

router.get(
  '/lots/:id',
  requireRoles(...INVENTORY_READ_ROLES),
  InventoryController.getLotById
);

// ---- Treatment Usage (Clinical lot consumption: Admin, RN Injector, Nurse Practitioner) ----
// Medical Director remains read-only unless separately authorized.

router.post(
  '/usage',
  requireRoles('admin', 'nurse_practitioner', 'rn_injector'),
  validate({ body: RecordTreatmentUsageSchema }),
  auditPhiAccess('encounter', 'update'),
  InventoryController.recordTreatmentUsage
);

// ---- Inventory Movements (Admin only) ----

router.post(
  '/movements',
  requireRoles('admin'),
  validate({ body: CreateInventoryMovementSchema }),
  InventoryController.createMovement
);

export default router;
