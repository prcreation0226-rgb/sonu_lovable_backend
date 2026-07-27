// Radiantilyk EMR — Compliance & Audit Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all compliance endpoints.
// Restricted to COMPLIANCE_ROLES (admin, privacy_officer) for most endpoints.

import { Router } from 'express';
import { ComplianceController } from '../controllers/compliance.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES, COMPLIANCE_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateBreachReportSchema,
  UpdateBreachReportSchema,
  CreatePolicyVersionSchema,
  CreateStaffTrainingSchema,
  CreateExternalDisclosureSchema,
  QueryAuditLogSchema,
} from '../schemas/compliance.schema';

const router = Router();

// All compliance endpoints require authentication
router.use(authenticate);

// ---- Breach Reports ----

router.post(
  '/breach-reports',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateBreachReportSchema }),
  ComplianceController.createBreachReport
);

router.get(
  '/breach-reports',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getBreachReports
);

router.get(
  '/breach-reports/:id',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getBreachReportById
);

router.patch(
  '/breach-reports/:id',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: UpdateBreachReportSchema }),
  ComplianceController.updateBreachReport
);

// ---- Policies ----

router.post(
  '/policies',
  requireRoles('admin'),
  validate({ body: CreatePolicyVersionSchema }),
  ComplianceController.createPolicyVersion
);

router.get(
  '/policies',
  requireRoles(...STAFF_ROLES),
  ComplianceController.getPolicies
);

// ---- Training Records ----

router.post(
  '/training-records',
  requireRoles('admin', 'privacy_officer'),
  validate({ body: CreateStaffTrainingSchema }),
  ComplianceController.createTrainingRecord
);

router.get(
  '/training-records/staff/:staffId',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getStaffTrainingRecords
);

// ---- External Disclosures ----

router.post(
  '/external-disclosures',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateExternalDisclosureSchema }),
  auditPhiAccess('patient_profile', 'export'),
  ComplianceController.createExternalDisclosure
);

router.get(
  '/external-disclosures/patient/:patientId',
  requireRoles(...COMPLIANCE_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  ComplianceController.getPatientDisclosures
);

// ---- Audit Logs ----

router.get(
  '/audit-logs',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ query: QueryAuditLogSchema }),
  ComplianceController.queryAuditLogs
);

router.get(
  '/phi-access-logs',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ query: QueryAuditLogSchema }),
  ComplianceController.queryPhiAccessLogs
);

export default router;
