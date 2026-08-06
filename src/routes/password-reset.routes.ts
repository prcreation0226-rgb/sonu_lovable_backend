// Radiantilyk EMR — Password Reset Module Routes
// Dedicated Express router for public password reset endpoints.

import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { RequestPasswordResetSchema, ConfirmPasswordResetSchema } from '../schemas/auth.schema';
import { PasswordResetService } from '../services/password-reset.service';

const router = Router();

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public (Rate Limited)
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: RequestPasswordResetSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';
      const result = await PasswordResetService.requestPasswordReset(req.body.email, ip, userAgent);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using opaque token
 * @access  Public (Rate Limited)
 */
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: ConfirmPasswordResetSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';
      const { token, newPassword } = req.body;
      const result = await PasswordResetService.resetPassword(token, newPassword, ip, userAgent);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
