import { Router } from 'express';
import { MfaController } from '../controllers/mfa.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { requireRecentAal2 } from '../middleware/mfa';
import { mfaLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(mfaLimiter);

/**
 * @route   POST /api/v1/auth/mfa/challenge/verify
 * @desc    Verify 6-digit TOTP code during login challenge
 * @access  Public (MFA Pending Cookie)
 */
router.post('/challenge/verify', MfaController.verifyChallenge);

/**
 * @route   POST /api/v1/auth/mfa/recovery/verify
 * @desc    Verify high-entropy recovery code during login challenge
 * @access  Public (MFA Pending Cookie)
 */
router.post('/recovery/verify', MfaController.verifyRecoveryCode);

/**
 * @route   POST /api/v1/auth/mfa/cancel
 * @desc    Safely cancel pending MFA challenge and clear pending cookie
 * @access  Public (MFA Pending Cookie)
 */
router.post('/cancel', MfaController.cancelChallenge);

/**
 * @route   GET /api/v1/auth/mfa/status
 * @desc    Get user MFA status and active factors
 * @access  Authenticated
 */
router.get('/status', authenticate, MfaController.getStatus);

/**
 * @route   POST /api/v1/auth/mfa/enroll/start
 * @desc    Start TOTP enrollment (generates secret and otpauth URI)
 * @access  Authenticated OR Pending Enrollment Cookie
 */
router.post('/enroll/start', optionalAuth, MfaController.startEnrollment);

/**
 * @route   POST /api/v1/auth/mfa/enroll/verify
 * @desc    Complete TOTP enrollment (verifies code and generates recovery codes)
 * @access  Authenticated OR Pending Enrollment Cookie
 */
router.post('/enroll/verify', optionalAuth, MfaController.verifyEnrollment);

/**
 * @route   POST /api/v1/auth/mfa/recovery/regenerate
 * @desc    Regenerate new recovery codes
 * @access  Authenticated + Recent AAL2
 */
router.post('/recovery/regenerate', authenticate, requireRecentAal2, MfaController.regenerateRecoveryCodes);

/**
 * @route   POST /api/v1/auth/mfa/disable
 * @desc    Disable TOTP MFA for authenticated user
 * @access  Authenticated + Recent AAL2
 */
router.post('/disable', authenticate, requireRecentAal2, MfaController.disableMfa);

/**
 * @route   POST /api/v1/admin/users/:userId/mfa/reset
 * @desc    Admin reset MFA for target user
 * @access  Authenticated Admin + Recent AAL2
 */
router.post('/users/:userId/mfa/reset', authenticate, requireRoles('admin'), requireRecentAal2, MfaController.adminResetMfa);

export default router;
