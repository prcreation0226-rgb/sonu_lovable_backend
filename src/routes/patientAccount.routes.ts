import { Router } from 'express';
import { PatientAccountController } from '../controllers/patientAccount.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, requirePermission } from '../middleware/rbac';
import { auditPhiAccess } from '../middleware/audit';

const router = Router();

// Require authentication for all endpoints
router.use(authenticate);

// ---- Admin-Only Manager Access Delegation ----

/**
 * @route   POST /api/v1/patient-accounts/grant-manager/:staffId
 * @desc    Grant PATIENT_ACCOUNT_MANAGER role to a selected Front Desk staff member
 * @access  Admin ONLY
 */
router.post(
  '/grant-manager/:staffId',
  requireRoles('admin'),
  PatientAccountController.grantManagerAccess
);

/**
 * @route   POST /api/v1/patient-accounts/revoke-manager/:staffId
 * @desc    Revoke PATIENT_ACCOUNT_MANAGER role from a staff member
 * @access  Admin ONLY
 */
router.post(
  '/revoke-manager/:staffId',
  requireRoles('admin'),
  PatientAccountController.revokeManagerAccess
);

// ---- Patient Account Management Endpoints (PATIENT_ACCOUNT_MANAGE Permission ONLY) ----

/**
 * @route   GET /api/v1/patient-accounts
 * @desc    Search and list patient accounts
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.get(
  '/',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  auditPhiAccess('patient_profile', 'view'),
  PatientAccountController.getPatientAccounts
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/create-login
 * @desc    Create login access for an existing PatientProfile without a User
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/create-login',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  auditPhiAccess('patient_profile', 'create'),
  PatientAccountController.createPatientLogin
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/activate
 * @desc    Activate patient login access (User.isActive = true)
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/activate',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  PatientAccountController.activatePatientLogin
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/deactivate
 * @desc    Deactivate patient login access (User.isActive = false)
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/deactivate',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  PatientAccountController.deactivatePatientLogin
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/unlock
 * @desc    Unlock locked patient account (clear lockedUntil & failedAttempts)
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/unlock',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  PatientAccountController.unlockPatientAccount
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/reset-access
 * @desc    Reset patient login credentials (generate new one-time temporary password)
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/reset-access',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  PatientAccountController.resetPatientAccess
);

/**
 * @route   POST /api/v1/patient-accounts/:patientProfileId/force-password-change
 * @desc    Set mustChangePassword = true for patient
 * @access  PATIENT_ACCOUNT_MANAGE Permission ONLY
 */
router.post(
  '/:patientProfileId/force-password-change',
  requirePermission('PATIENT_ACCOUNT_MANAGE'),
  PatientAccountController.forcePasswordChange
);

export default router;
