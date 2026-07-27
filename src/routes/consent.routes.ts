// Radiantilyk EMR — Consent Management Routes
// Express router enforcing Auth + RBAC + Zod Validation + PHI Audit on all consent endpoints.

import { Router } from 'express';
import { ConsentController } from '../controllers/consent.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateConsentTemplateSchema,
  UpdateConsentTemplateSchema,
  CreateConsentVersionSchema,
  CreateConsentAssignmentSchema,
  SignConsentSchema,
} from '../schemas/consent.schema';

const router = Router();

// All consent endpoints require authentication
router.use(authenticate);

// ---- Templates ----

router.post(
  '/templates',
  requireRoles('admin', 'medical_director'),
  validate({ body: CreateConsentTemplateSchema }),
  ConsentController.createTemplate
);

router.get(
  '/templates',
  requireRoles(...STAFF_ROLES),
  ConsentController.getTemplates
);

router.get(
  '/templates/:id',
  requireRoles(...STAFF_ROLES),
  ConsentController.getTemplateById
);

router.patch(
  '/templates/:id',
  requireRoles('admin', 'medical_director'),
  validate({ body: UpdateConsentTemplateSchema }),
  ConsentController.updateTemplate
);

router.delete(
  '/templates/:id',
  requireRoles('admin'),
  ConsentController.deleteTemplate
);

// ---- Versions ----

router.post(
  '/templates/:id/versions',
  requireRoles('admin', 'medical_director'),
  validate({ body: CreateConsentVersionSchema }),
  ConsentController.createVersion
);

// ---- Assignments ----

router.post(
  '/assignments',
  requireRoles(...STAFF_ROLES),
  validate({ body: CreateConsentAssignmentSchema }),
  auditPhiAccess('consent_signature', 'create'),
  ConsentController.createAssignment
);

router.get(
  '/assignments/patient/:patientId',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('consent_signature', 'view'),
  ConsentController.getPatientAssignments
);

// ---- Signatures ----

router.post(
  '/assignments/:id/sign',
  requireRoles(...STAFF_ROLES, 'patient'),
  validate({ body: SignConsentSchema }),
  auditPhiAccess('consent_signature', 'update'),
  ConsentController.signConsent
);

router.get(
  '/signatures/:id',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('consent_signature', 'view'),
  ConsentController.getSignatureById
);

export default router;
