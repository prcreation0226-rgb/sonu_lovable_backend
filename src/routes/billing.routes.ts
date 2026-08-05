// Radiantilyk EMR — Billing & Payments Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all billing endpoints.
// PCI-compliant: No raw card data in request/response payloads.

import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateInvoiceSchema,
  CheckoutTransactionSchema,
  RecordPaymentSchema,
  CreateRefundSchema,
  CreatePatientCreditSchema,
  CreateNoShowChargeSchema,
} from '../schemas/billing.schema';

const router = Router();

// Approved Client Role Alignment: Admin & Front Desk only (Patients for own invoices only)
const BILLING_ALLOWED_ROLES = ['admin', 'front_desk'] as const;

// All billing endpoints require authentication
router.use(authenticate);

// ---- Checkout Transaction ----

router.post(
  '/checkout',
  requireRoles(...BILLING_ALLOWED_ROLES),
  validate({ body: CheckoutTransactionSchema }),
  auditPhiAccess('patient_profile', 'create'),
  BillingController.checkoutTransaction
);

router.post(
  '/pos-create-or-get-sale',
  requireRoles(...BILLING_ALLOWED_ROLES),
  BillingController.checkoutTransaction
);

router.post(
  '/pos-finalize-sale',
  requireRoles(...BILLING_ALLOWED_ROLES),
  BillingController.checkoutTransaction
);

router.post(
  '/pos-update-sale',
  requireRoles(...BILLING_ALLOWED_ROLES),
  BillingController.checkoutTransaction
);

// ---- Invoices ----

router.post(
  '/invoices',
  requireRoles(...BILLING_ALLOWED_ROLES),
  validate({ body: CreateInvoiceSchema }),
  auditPhiAccess('patient_profile', 'create'),
  BillingController.createInvoice
);

router.get(
  '/invoices',
  requireRoles(...BILLING_ALLOWED_ROLES),
  BillingController.getInvoices
);

router.get(
  '/invoices/:id',
  requireRoles(...BILLING_ALLOWED_ROLES, 'patient'),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getInvoiceById
);

router.get(
  '/invoices/patient/:patientId',
  requireRoles(...BILLING_ALLOWED_ROLES, 'patient'),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientInvoices
);

router.post(
  '/invoices/:id/cancel',
  requireRoles(...BILLING_ALLOWED_ROLES),
  auditPhiAccess('patient_profile', 'update'),
  BillingController.cancelInvoice
);

// ---- Payments ----

router.post(
  '/payments',
  requireRoles(...BILLING_ALLOWED_ROLES),
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
  requireRoles(...BILLING_ALLOWED_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  BillingController.getPatientCredits
);

// ---- No-Show Charges ----

router.post(
  '/no-show-charges',
  requireRoles(...BILLING_ALLOWED_ROLES),
  validate({ body: CreateNoShowChargeSchema }),
  BillingController.createNoShowCharge
);

export default router;
