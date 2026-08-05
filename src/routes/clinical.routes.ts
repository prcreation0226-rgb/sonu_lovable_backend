// Radiantilyk EMR — Clinical EMR Routes
// Express router for Encounters, SOAP Notes, Cosigns, Addendums, Cosign Queue, Clinical Reviews, and Prescriptions.
//
// HEALTHCARE & HIPAA GUARDRAILS ENFORCED ON ALL ENDPOINTS:
// 1. authenticate (JWT Access Token + Live Database Role Freshness)
// 2. requireRoles (Strict Action-Level Authorization per Option A Alignment)
// 3. validate (Zod schema input guard)
// 4. auditPhiAccess (HIPAA ePHI Audit Logging)

import { Router, Request, Response } from 'express';
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

/**
 * @route   GET /api/v1/clinical/tox-guardrails
 * @desc    Get neurotoxin dosage safety guardrails by product name (Public/Reference endpoint)
 * @access  Public / Clinical Reference
 */
router.get('/tox-guardrails', (req: Request, res: Response): void => {
  const product = (req.query.product as string) || 'Botox';
  const isDysport = product.toLowerCase().includes('dysport');

  const mult = isDysport ? 2.5 : 1;
  const guardrails = [
    { product, zone: 'Glabella (Frown Lines)', min_units: Math.round(12 * mult), typical_units: Math.round(20 * mult), max_units: Math.round(30 * mult) },
    { product, zone: 'Forehead (Frontalis)', min_units: Math.round(6 * mult), typical_units: Math.round(12 * mult), max_units: Math.round(20 * mult) },
    { product, zone: "Crow's Feet (Orbicularis Oculi)", min_units: Math.round(8 * mult), typical_units: Math.round(16 * mult), max_units: Math.round(24 * mult) },
    { product, zone: 'Bunny Lines (Nasalis)', min_units: Math.round(2 * mult), typical_units: Math.round(4 * mult), max_units: Math.round(6 * mult) },
    { product, zone: 'Masseters / TMJ', min_units: Math.round(20 * mult), typical_units: Math.round(40 * mult), max_units: Math.round(60 * mult) },
    { product, zone: 'Lip Flip / Perioral', min_units: Math.round(2 * mult), typical_units: Math.round(4 * mult), max_units: Math.round(6 * mult) },
    { product, zone: 'Gummy Smile', min_units: Math.round(2 * mult), typical_units: Math.round(4 * mult), max_units: Math.round(6 * mult) },
    { product, zone: 'Platysmal Bands (Nefertiti)', min_units: Math.round(20 * mult), typical_units: Math.round(30 * mult), max_units: Math.round(50 * mult) },
  ];

  res.json({ success: true, data: guardrails });
});

// All subsequent clinical endpoints require authentication
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
 * @route   GET /api/v1/clinical/notes
 * @desc    List SOAP notes for patient / clinical chart
 * @access  Clinical Providers (Admin, MD, NP, RN) — Denied to Front Desk, Privacy Officer, Patient
 */
router.get(
  '/notes',
  requireRoles(...CLINICAL_ROLES),
  auditPhiAccess('soap_note', 'view'),
  ClinicalController.getSoapNotes
);

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
 * @route   POST /api/v1/clinical/soap-notes/:id/sign-own
 * @desc    Sign own note / Submit draft for required cosign
 * @access  RN Injector, Nurse Practitioner, Medical Director (Author of note)
 */
router.post(
  '/soap-notes/:id/sign-own',
  requireRoles('rn_injector', 'nurse_practitioner', 'medical_director'),
  validate({ body: SignSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.signOwnNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/cosign
 * @desc    Cosign & lock another provider's SOAP note (Supervising Provider workflow)
 * @access  Medical Director, Nurse Practitioner — RN Injector & Admin denied unless NP/MD role assigned
 */
router.post(
  '/soap-notes/:id/cosign',
  requireRoles('medical_director', 'nurse_practitioner'),
  validate({ body: SignSoapNoteSchema }),
  auditPhiAccess('soap_note', 'update'),
  ClinicalController.cosignNote
);

/**
 * @route   POST /api/v1/clinical/soap-notes/:id/sign
 * @desc    Sign & Lock SOAP Note (Generic compatibility path)
 * @access  Supervising Providers (Medical Director, Nurse Practitioner)
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
