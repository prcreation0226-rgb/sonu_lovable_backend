// Radiantilyk EMR — Patient PHI Module Routes
// Express router for all patient endpoints.
//
// HIPAA & CMIA SECURITY GUARDRAIL ENFORCED ON EVERY ROUTE:
// 1. authenticate (JWT Access Token)
// 2. requireRoles (RBAC role authorization)
// 3. validate (Zod schema input sanitization)
// 4. auditPhiAccess (Automatic HIPAA ePHI audit trail logging)

import { Router } from 'express';
import { PatientController } from '../controllers/patient.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreatePatientSchema,
  UpdatePatientSchema,
  DemographicsSchema,
  MedicalHistorySchema,
  AllergySchema,
  MedicationSchema,
  DocumentUploadRequestSchema,
  PhotoUploadRequestSchema,
  CommPrefSchema,
  CmiaDeletionRequestSchema,
} from '../schemas/patient.schema';

const router = Router();

// All patient endpoints require authentication
router.use(authenticate);

// ---- Patient Profile Endpoints ----

/**
 * @route   POST /api/v1/patients
 * @desc    Create new Patient Profile
 * @access  Admin and Front Desk ONLY
 */
router.post(
  '/',
  requireRoles('admin', 'front_desk'),
  validate({ body: CreatePatientSchema }),
  auditPhiAccess('patient_profile', 'create'),
  PatientController.createPatient
);

/**
 * @route   GET /api/v1/patients
 * @desc    List patients with pagination & search
 * @access  All Staff Roles
 */
router.get(
  '/',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  PatientController.getPatients
);

/**
 * @route   GET /api/v1/patients/:id
 * @desc    Get complete Patient Chart by ID
 * @access  All Staff Roles
 */
router.get(
  '/:id',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  PatientController.getPatientById
);

/**
 * @route   PATCH /api/v1/patients/:id
 * @desc    Update Patient Profile details
 * @access  Admin and Front Desk ONLY
 */
router.patch(
  '/:id',
  requireRoles('admin', 'front_desk'),
  validate({ body: UpdatePatientSchema }),
  auditPhiAccess('patient_profile', 'update'),
  PatientController.updatePatient
);

/**
 * @route   DELETE /api/v1/patients/:id
 * @desc    Soft-delete Patient Profile (Hard delete blocked)
 * @access  Admin ONLY
 */
router.delete(
  '/:id',
  requireRoles('admin'),
  auditPhiAccess('patient_profile', 'delete'),
  PatientController.softDeletePatient
);

// ---- Clinical Sub-Records ----

/**
 * @route   POST /api/v1/patients/:id/demographics
 * @desc    Upsert Patient Demographics
 * @access  All Staff Roles
 */
router.post(
  '/:id/demographics',
  requireRoles(...STAFF_ROLES),
  validate({ body: DemographicsSchema }),
  auditPhiAccess('patient_profile', 'update'),
  PatientController.upsertDemographics
);

/**
 * @route   POST /api/v1/patients/:id/medical-history
 * @desc    Add Medical History condition
 * @access  Clinical Staff (Admin, MD, NP)
 */
router.post(
  '/:id/medical-history',
  requireRoles('admin', 'medical_director', 'nurse_practitioner'),
  validate({ body: MedicalHistorySchema }),
  auditPhiAccess('medical_history', 'create'),
  PatientController.addMedicalHistory
);

/**
 * @route   POST /api/v1/patients/:id/allergies
 * @desc    Add Patient Allergy
 * @access  Clinical Staff (Admin, MD, NP)
 */
router.post(
  '/:id/allergies',
  requireRoles('admin', 'medical_director', 'nurse_practitioner'),
  validate({ body: AllergySchema }),
  auditPhiAccess('allergy', 'create'),
  PatientController.addAllergy
);

/**
 * @route   POST /api/v1/patients/:id/medications
 * @desc    Add Patient Medication
 * @access  Clinical Staff (Admin, MD, NP)
 */
router.post(
  '/:id/medications',
  requireRoles('admin', 'medical_director', 'nurse_practitioner'),
  validate({ body: MedicationSchema }),
  auditPhiAccess('medication', 'create'),
  PatientController.addMedication
);

// ---- Documents & Photos S3 Uploads ----

/**
 * @route   POST /api/v1/patients/:id/documents/upload-url
 * @desc    Generate S3 Presigned Upload URL for Patient Document
 * @access  All Staff Roles
 */
router.post(
  '/:id/documents/upload-url',
  requireRoles(...STAFF_ROLES),
  validate({ body: DocumentUploadRequestSchema }),
  auditPhiAccess('patient_document', 'create'),
  PatientController.requestDocumentUpload
);

/**
 * @route   POST /api/v1/patients/:id/photos/upload-url
 * @desc    Generate S3 Presigned Upload URL for Patient Photo
 * @access  All Staff Roles
 */
router.post(
  '/:id/photos/upload-url',
  requireRoles(...STAFF_ROLES),
  validate({ body: PhotoUploadRequestSchema }),
  auditPhiAccess('patient_photo', 'create'),
  PatientController.requestPhotoUpload
);

/**
 * @route   GET /api/v1/patients/documents/:docId/download-url
 * @desc    Get S3 Presigned Download URL for Document
 * @access  All Staff Roles
 */
router.get(
  '/documents/:docId/download-url',
  requireRoles(...STAFF_ROLES),
  auditPhiAccess('patient_document', 'download'),
  PatientController.getDocumentDownloadUrl
);

// ---- Communication & CMIA Compliance ----

/**
 * @route   POST /api/v1/patients/:id/communication-preferences
 * @desc    Upsert Patient Communication Preferences
 * @access  All Staff Roles
 */
router.post(
  '/:id/communication-preferences',
  requireRoles(...STAFF_ROLES),
  validate({ body: CommPrefSchema }),
  auditPhiAccess('patient_profile', 'update'),
  PatientController.upsertCommPref
);

/**
 * @route   POST /api/v1/patients/:id/cmia-deletion-request
 * @desc    Submit CMIA PHI Deletion Request (7-Year Rule Check)
 * @access  Admin, Privacy Officer
 */
router.post(
  '/:id/cmia-deletion-request',
  requireRoles('admin', 'privacy_officer'),
  validate({ body: CmiaDeletionRequestSchema }),
  auditPhiAccess('patient_profile', 'delete'),
  PatientController.submitCmiaDeletionRequest
);

export default router;
