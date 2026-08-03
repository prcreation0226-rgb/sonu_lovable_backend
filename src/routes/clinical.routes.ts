// Radiantilyk EMR — Clinical EMR Routes
// Express router for Encounters, SOAP Notes, Cosigns, Addendums, Cosign Queue, Clinical Reviews, and Prescriptions.
//
// HEALTHCARE & HIPAA GUARDRAILS ENFORCED ON ALL ENDPOINTS:
// 1. authenticate (JWT Access Token + Live Database Role Freshness)
// 2. requireRoles (Strict Action-Level Authorization per Option A Alignment)
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

// All clinical endpoints require authentication
router.use(authenticate);

// ---- Encounters ----

/**
 * @route   POST /api/v1/clinical/encounters
 * @desc    Start new patient clinical encounter
 * @access  Clinical Providers (Admin, MD, NP, RN)
 */
router.post(
  '/encounters',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: CreateEncounterSchema }),
  auditPhiAccess('encounter', 'create'),
  ClinicalController.createEncounter
);

/**
 * @route   GET /api/v1/clinical/encounters/:id
 * @desc    Get detailed encounter chart by ID
 * @access  Clinical Providers
 */
router.get(
  '/encounters/:id',
  requireRoles(...CLINICAL_ROLES),
  auditPhiAccess('encounter', 'view'),
  ClinicalController.getEncounterById
);

/**
 * @route   PATCH /api/v1/clinical/encounters/:id/status
 * @desc    Update encounter status (in_progress, completed, cancelled)
 * @access  Clinical Providers
 */
router.patch(
  '/encounters/:id/status',
  requireRoles(...CLINICAL_ROLES),
  auditPhiAccess('encounter', 'update'),
  ClinicalController.updateEncounterStatus
);

// ---- SOAP Notes & Cosign Workflow ----

/**
 * @route   POST /api/v1/clinical/soap-notes
 * @desc    Create new SOAP Note (Draft / Pending Cosign / Signed)
 * @access  Clinical Providers (MD, NP, RN, Admin)
 */
router.post(
  '/soap-notes',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: CreateSoapNoteSchema }),
  auditPhiAccess('soap_note', 'create'),
  ClinicalController.createSoapNote
);

/**
 * @route   PATCH /api/v1/clinical/soap-notes/:id
 * @desc    Update Draft SOAP Note (IMMUTABILITY GUARD: Blocked if Signed/Locked)
 * @access  Clinical Providers
 */
router.patch(
  '/soap-notes/:id',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: UpdateSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.updateSoapNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/sign
 * @desc    Sign & Lock SOAP Note (Supervising Provider Cosign Workflow)
 * @access  Supervising Providers (Medical Director, Nurse Practitioner) — RN & Admin denied unless NP/MD role assigned
 */
router.post(
  '/soap-notes/:id/sign',
  requireRoles('medical_director', 'nurse_practitioner'),
  validate({ body: SignSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.signSoapNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/addendum
 * @desc    Append Addendum to Signed/Locked SOAP Note
 * @access  Clinical Providers
 */
router.post(
  '/soap-notes/:id/addendum',
  requireRoles(...CLINICAL_ROLES),
  validate({ body: AddendumSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.addAddendum
);

/**
 * @route   GET /api/v1/clinical/cosign-queue
 * @desc    Get SOAP notes pending cosign review for supervising provider
 * @access  Supervising Providers (Medical Director, Nurse Practitioner)
 */
router.get(
  '/cosign-queue',
  requireRoles('medical_director', 'nurse_practitioner'),
  auditPhiAccess('soap_note', 'view'),
  ClinicalController.getCosignQueue
);

// ---- MD-Only Actions (Option A Alignment) ----

/**
 * @route   GET /api/v1/clinical/reviews
 * @desc    Medical Director Clinical Chart Reviews
 * @access  Medical Director Only (medical_director) — Admin denied unless MD role assigned
 */
router.get(
  '/reviews',
  requireRoles('medical_director'),
  auditPhiAccess('soap_note', 'view'),
  ClinicalController.getClinicalReviews
);

/**
 * @route   POST /api/v1/clinical/prescriptions
 * @desc    Create / Issue Prescription
 * @access  Medical Director Only (medical_director) — Admin denied unless MD role assigned
 */
router.post(
  '/prescriptions',
  requireRoles('medical_director'),
  auditPhiAccess('prescription', 'create'),
  ClinicalController.createPrescription
);

/**
 * @route   POST /api/v1/clinical/prescriptions/:id/approve
 * @desc    Approve Pending Prescription
 * @access  Medical Director Only (medical_director) — Admin denied unless MD role assigned
 */
router.post(
  '/prescriptions/:id/approve',
  requireRoles('medical_director'),
  auditPhiAccess('prescription', 'update'),
  ClinicalController.approvePrescription
);

export default router;
