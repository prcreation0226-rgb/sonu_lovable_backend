// Radiantilyk EMR — Auth Module Routes
// Express router for all authentication endpoints.

import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import {
  LoginSchema,
  MfaLoginSchema,
  ChangePasswordSchema,
  MfaVerifySchema,
} from '../schemas/auth.schema';

const router = Router();

// ---- Public Routes (Rate Limited) ----

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate with email & password
 * @access  Public
 */
router.post('/login', authLimiter, validate({ body: LoginSchema }), AuthController.login);

/**
 * @route   POST /api/v1/auth/mfa/login-verify
 * @desc    Verify 6-digit TOTP code during login challenge
 * @access  Public (requires MFA challenge token)
 */
router.post('/mfa/login-verify', authLimiter, validate({ body: MfaLoginSchema }), AuthController.verifyMfaLogin);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rotate refresh token (from HttpOnly cookie) and issue new access token
 * @access  Public (requires valid refresh token cookie)
 */
router.post('/refresh', AuthController.refreshToken);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    DEPRECATED — Compatibility alias for /refresh. Will be removed.
 * @access  Public (requires valid refresh token cookie)
 */
router.post('/refresh-token', AuthController.refreshToken);

/**
 * @route   POST /api/v1/auth/verify-phase1a
 * @desc    Run Phase 1A Live MySQL Auth Audit Verification Suite
 * @access  Public
 */
router.post('/verify-phase1a', AuthController.verifyPhase1a);

// ---- Protected Routes (Requires JWT Access Token) ----

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get profile & roles of authenticated user
 * @access  Protected
 */
router.get('/me', authenticate, AuthController.getMe);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidate active session and refresh tokens
 * @access  Public / Optional Auth (Always succeeds)
 */
router.post('/logout', optionalAuth, AuthController.logout);

/**
 * @route   POST /api/v1/auth/mfa/setup
 * @desc    Generate TOTP secret and QR code URL
 * @access  Protected
 */
router.post('/mfa/setup', authenticate, AuthController.setupMfa);

/**
 * @route   POST /api/v1/auth/mfa/verify
 * @desc    Verify TOTP code to finalize MFA enablement
 * @access  Protected
 */
router.post('/mfa/verify', authenticate, validate({ body: MfaVerifySchema }), AuthController.verifyMfaSetup);

/**
 * @route   POST /api/v1/auth/password/change
 * @desc    Change password with current password & 5-password history check
 * @access  Protected
 */
router.post('/password/change', authenticate, validate({ body: ChangePasswordSchema }), AuthController.changePassword);

export default router;
