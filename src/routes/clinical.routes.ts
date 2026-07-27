// Radiantilyk EMR — Clinical EMR Routes
// Express router for Encounters, SOAP Notes, Cosigns, Addendums, and Cosign Queue.
//
// HEALTHCARE & HIPAA GUARDRAILS ENFORCED ON ALL ENDPOINTS:
// 1. authenticate (JWT Access Token)
// 2. requireRoles (Restricted to Clinical Roles: admin, medical_director, nurse_practitioner)
// 3. validate (Zod schema input guard)
// 4. auditPhiAccess (HIPAA ePHI Audit Logging)

import { Router } from 'express';
import { ClinicalController } from '../controllers/clinical.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, CLINICAL_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateEncounterSchema,
  CreateSoapNoteSchema,
  UpdateSoapNoteSchema,
  SignSoapNoteSchema,
  AddendumSchema,
} from '../schemas/clinical.schema';

const router = Router();

// All clinical endpoints require authentication and clinical role authorization
router.use(authenticate);
router.use(requireRoles(...CLINICAL_ROLES));

// ---- Encounters ----

/**
 * @route   POST /api/v1/clinical/encounters
 * @desc    Start new patient clinical encounter
 * @access  Clinical Staff (Admin, MD, NP)
 */
router.post(
  '/encounters',
  validate({ body: CreateEncounterSchema }),
  auditPhiAccess('encounter', 'create'),
  ClinicalController.createEncounter
);

/**
 * @route   GET /api/v1/clinical/encounters/:id
 * @desc    Get detailed encounter chart by ID
 * @access  Clinical Staff
 */
router.get(
  '/encounters/:id',
  auditPhiAccess('encounter', 'view'),
  ClinicalController.getEncounterById
);

/**
 * @route   PATCH /api/v1/clinical/encounters/:id/status
 * @desc    Update encounter status (in_progress, completed, cancelled)
 * @access  Clinical Staff
 */
router.patch(
  '/encounters/:id/status',
  auditPhiAccess('encounter', 'update'),
  ClinicalController.updateEncounterStatus
);

// ---- SOAP Notes & Cosign Workflow ----

/**
 * @route   POST /api/v1/clinical/soap-notes
 * @desc    Create new SOAP Note (Draft / Pending Cosign / Signed)
 * @access  Clinical Staff
 */
router.post(
  '/soap-notes',
  validate({ body: CreateSoapNoteSchema }),
  auditPhiAccess('soap_note', 'create'),
  ClinicalController.createSoapNote
);

/**
 * @route   PATCH /api/v1/clinical/soap-notes/:id
 * @desc    Update Draft SOAP Note (IMMUTABILITY GUARD: Blocked if Signed/Locked)
 * @access  Clinical Staff
 */
router.patch(
  '/soap-notes/:id',
  validate({ body: UpdateSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.updateSoapNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/sign
 * @desc    Sign & Lock SOAP Note (Supervising MD / NP Cosign Workflow)
 * @access  Clinical Staff (Admin, MD, NP)
 */
router.post(
  '/soap-notes/:id/sign',
  validate({ body: SignSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.signSoapNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/addendum
 * @desc    Append Addendum to Signed/Locked SOAP Note (Original note NEVER edited)
 * @access  Clinical Staff
 */
router.post(
  '/soap-notes/:id/addendum',
  validate({ body: AddendumSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.addAddendum
);

/**
 * @route   GET /api/v1/clinical/cosign-queue
 * @desc    Get SOAP notes pending cosign review for supervising provider
 * @access  Supervising Providers (Admin, MD, NP)
 */
router.get(
  '/cosign-queue',
  auditPhiAccess('soap_note', 'view'),
  ClinicalController.getCosignQueue
);

export default router;
