// Radiantilyk EMR — Billing & Payments Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all billing endpoints.
// PCI-compliant: No raw card data in request/response payloads.

import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateInvoiceSchema,
  RecordPaymentSchema,
  CreateRefundSchema,
  CreatePatientCreditSchema,
  CreateNoShowChargeSchema,
} from '../schemas/billing.schema';

const router = Router();

// All billing endpoints require authentication
router.use(authenticate);

// ---- Invoices ----

router.post(
  '/invoices',
  requireRoles('admin', 'receptionist', 'scheduler'),
  validate({ body: CreateInvoiceSchema }),
  auditPhiAccess('patient_profile', 'create'),
  BillingController.createInvoice
);

router.get(
  '/invoices',
  requireRoles(...STAFF_ROLES),
  BillingController.getInvoices
);

router.get(
  '/invoices/:id',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getInvoiceById
);

router.get(
  '/invoices/patient/:patientId',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientInvoices
);

// ---- Payments ----

router.post(
  '/payments',
  requireRoles('admin', 'receptionist'),
  validate({ body: RecordPaymentSchema }),
  auditPhiAccess('patient_profile', 'create'),
  BillingController.recordPayment
);

// ---- Refunds ----

router.post(
  '/refunds',
  requireRoles('admin'),
  validate({ body: CreateRefundSchema }),
  BillingController.createRefund
);

// ---- Credits ----

router.post(
  '/credits',
  requireRoles('admin'),
  validate({ body: CreatePatientCreditSchema }),
  BillingController.createCredit
);

router.get(
  '/credits/patient/:patientId',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientCredits
);

// ---- No-Show Charges ----

router.post(
  '/no-show-charges',
  requireRoles('admin', 'receptionist'),
  validate({ body: CreateNoShowChargeSchema }),
  BillingController.createNoShowCharge
);

export default router;
