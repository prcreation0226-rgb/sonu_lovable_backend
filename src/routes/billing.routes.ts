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

const BILLING_READ_ROLES = ['admin', 'front_desk', 'medical_director', 'nurse_practitioner', 'rn_injector'] as const;

// All billing endpoints require authentication
router.use(authenticate);

// ---- Invoices ----

router.post(
  '/invoices',
  requireRoles('admin', 'front_desk'),
  validate({ body: CreateInvoiceSchema }),
  auditPhiAccess('patient_profile', 'create'),
  BillingController.createInvoice
);

router.get(
  '/invoices',
  requireRoles(...BILLING_READ_ROLES),
  BillingController.getInvoices
);

router.get(
  '/invoices/:id',
  requireRoles(...BILLING_READ_ROLES, 'patient'),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getInvoiceById
);

router.get(
  '/invoices/patient/:patientId',
  requireRoles(...BILLING_READ_ROLES, 'patient'),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientInvoices
);

router.post(
  '/invoices/:id/cancel',
  requireRoles('admin', 'front_desk'),
  auditPhiAccess('patient_profile', 'update'),
  BillingController.cancelInvoice
);

// ---- Payments ----

router.post(
  '/payments',
  requireRoles('admin', 'front_desk'),
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
  requireRoles(...BILLING_READ_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientCredits
);

// ---- No-Show Charges ----

router.post(
  '/no-show-charges',
  requireRoles('admin', 'front_desk'),
  validate({ body: CreateNoShowChargeSchema }),
  BillingController.createNoShowCharge
);

export default router;
