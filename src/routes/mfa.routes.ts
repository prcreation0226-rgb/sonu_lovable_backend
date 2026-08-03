import { Router } from 'express';
import { MfaController } from '../controllers/mfa.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

/**
 * @route   POST /api/v1/auth/mfa/challenge/verify
 * @desc    Verify 6-digit TOTP code during login challenge (Public / Pending MFA challenge token)
 * @access  Public (MFA Pending Cookie or Challenge Token)
 */
router.post('/challenge/verify', MfaController.verifyChallenge);

/**
 * @route   POST /api/v1/auth/mfa/recovery/verify
 * @desc    Verify high-entropy recovery code during login challenge
 * @access  Public (MFA Pending Cookie or Challenge Token) / Authenticated
 */
router.post('/recovery/verify', MfaController.verifyRecoveryCode);

/**
 * @route   GET /api/v1/auth/mfa/status
 * @desc    Get user MFA status and active factors
 * @access  Authenticated
 */
router.get('/status', authenticate, MfaController.getStatus);

/**
 * @route   POST /api/v1/auth/mfa/enroll/start
 * @desc    Start TOTP enrollment (generates secret and otpauth URI)
 * @access  Authenticated
 */
router.post('/enroll/start', authenticate, MfaController.startEnrollment);

/**
 * @route   POST /api/v1/auth/mfa/enroll/verify
 * @desc    Complete TOTP enrollment (verifies code and generates 10 recovery codes)
 * @access  Authenticated
 */
router.post('/enroll/verify', authenticate, MfaController.verifyEnrollment);

/**
 * @route   POST /api/v1/auth/mfa/recovery/regenerate
 * @desc    Regenerate new recovery codes
 * @access  Authenticated
 */
router.post('/recovery/regenerate', authenticate, MfaController.regenerateRecoveryCodes);

/**
 * @route   POST /api/v1/auth/mfa/disable
 * @desc    Disable TOTP MFA for authenticated user
 * @access  Authenticated
 */
router.post('/disable', authenticate, MfaController.disableMfa);

/**
 * @route   POST /api/v1/admin/users/:userId/mfa/reset
 * @desc    Admin reset MFA for target user
 * @access  Authenticated Admin
 */
router.post('/admin/users/:userId/mfa/reset', authenticate, requireRoles('admin'), MfaController.adminResetMfa);

export default router;
