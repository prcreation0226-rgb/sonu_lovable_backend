import { Request, Response, NextFunction } from 'express';
import { MfaService } from '../services/mfa.service';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { AppError } from '../utils/AppError';
import {
  setAuthCookies,
  clearAuthCookies,
  setMfaPendingCookie,
  clearMfaPendingCookie,
  extractMfaPendingToken,
} from '../utils/cookies';

export class MfaController {
  /**
   * GET /api/v1/auth/mfa/status
   */
  static async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser) throw AppError.unauthorized('Authentication required');

      const status = await MfaService.getMfaStatus(authUser.id);
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/enroll/start
   * Authenticated OR via pending MFA_ENROLLMENT challenge.
   * Returns secret & QR code. Never returns challengeToken in body.
   */
  static async startEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      let userId: string | null = null;

      const authUser = (req as AuthenticatedRequest).user;
      if (authUser) {
        userId = authUser.id;
      } else {
        const challengeToken = extractMfaPendingToken(req);
        if (challengeToken) {
          userId = await MfaService.getUserIdFromChallengeToken(challengeToken, 'MFA_ENROLLMENT');
        }
      }

      if (!userId) {
        throw AppError.unauthorized('Authentication or valid pending MFA enrollment challenge required');
      }

      const result = await MfaService.startEnrollment(userId, clientIp);

      res.status(200).json({
        success: true,
        data: result,
        message: 'MFA TOTP enrollment started successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/enroll/verify
   * Authenticated OR via pending MFA_ENROLLMENT challenge.
   * Completes enrollment. If called via pending challenge, issues AAL2 session & cookies.
   */
  static async verifyEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { factorId, code } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      if (!factorId || !code) {
        throw AppError.badRequest('factorId and code are required');
      }

      let userId: string | null = null;
      let isPendingEnrollment = false;

      const authUser = (req as AuthenticatedRequest).user;
      if (authUser) {
        userId = authUser.id;
      } else {
        const challengeToken = extractMfaPendingToken(req);
        if (challengeToken) {
          userId = await MfaService.getUserIdFromChallengeToken(challengeToken, 'MFA_ENROLLMENT');
          if (userId) isPendingEnrollment = true;
        }
      }

      if (!userId) {
        throw AppError.unauthorized('Authentication or valid pending MFA enrollment challenge required');
      }

      const result = await MfaService.verifyEnrollment(userId, factorId, code, clientIp);

      if (isPendingEnrollment) {
        // First-time enrollment completed during login challenge — issue AAL2 session
        const user = await AuthService.getUserById(userId);
        const tokens = await AuthService.createSessionAndTokens(user.id, user.email, user.roles, clientIp, userAgent, 'aal2');

        setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
        clearMfaPendingCookie(res);

        res.status(200).json({
          success: true,
          data: {
            user: { id: user.id, email: user.email, roles: user.roles },
            aal: 'aal2',
            recoveryCodes: result.recoveryCodes,
          },
          message: 'MFA enrollment verified and login completed',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          recoveryCodes: result.recoveryCodes,
        },
        message: 'MFA enrollment verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/challenge/verify
   * Public (MFA pending cookie) — verify 6-digit TOTP code during login challenge.
   */
  static async verifyChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const challengeToken = extractMfaPendingToken(req);
      const { code } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      if (!challengeToken) {
        throw AppError.unauthorized('Pending MFA challenge cookie or token is required');
      }
      if (!code) {
        throw AppError.badRequest('6-digit MFA code is required');
      }

      const result = await MfaService.verifyChallenge(challengeToken, code, clientIp, 'MFA_LOGIN');
      const user = await AuthService.getUserById(result.userId);
      const tokens = await AuthService.createSessionAndTokens(user.id, user.email, user.roles, clientIp, userAgent, 'aal2');

      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      clearMfaPendingCookie(res);

      res.status(200).json({
        success: true,
        data: {
          user: { id: user.id, email: user.email, roles: user.roles },
          aal: 'aal2',
        },
        message: 'MFA challenge verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/recovery/verify
   * Public (MFA pending cookie) — verify high-entropy recovery code during login challenge.
   */
  static async verifyRecoveryCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const challengeToken = extractMfaPendingToken(req);
      const { recoveryCode } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      if (!recoveryCode) {
        throw AppError.badRequest('Recovery code is required');
      }

      let userId: string | null = null;
      const authUser = (req as AuthenticatedRequest).user;
      if (authUser) {
        userId = authUser.id;
      } else if (challengeToken) {
        userId = await MfaService.getUserIdFromChallengeToken(challengeToken);
      }

      if (!userId) {
        throw AppError.unauthorized('Valid authentication or pending MFA challenge required');
      }

      await MfaService.verifyRecoveryCode(userId, recoveryCode, clientIp);

      const user = await AuthService.getUserById(userId);
      const tokens = await AuthService.createSessionAndTokens(user.id, user.email, user.roles, clientIp, userAgent, 'aal2');

      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      clearMfaPendingCookie(res);

      res.status(200).json({
        success: true,
        data: {
          user: { id: user.id, email: user.email, roles: user.roles },
          aal: 'aal2',
        },
        message: 'Recovery code verified and login completed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/cancel
   * Public (MFA pending cookie) — Safely cancel pending MFA challenge and clear cookies.
   */
  static async cancelChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const challengeToken = extractMfaPendingToken(req);
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';

      if (challengeToken) {
        await MfaService.cancelChallenge(challengeToken, clientIp);
      }

      clearMfaPendingCookie(res);

      res.status(200).json({
        success: true,
        message: 'MFA challenge cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/recovery/regenerate
   * Authenticated (Requires recent AAL2)
   */
  static async regenerateRecoveryCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser) throw AppError.unauthorized('Authentication required');
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';

      const result = await MfaService.regenerateRecoveryCodes(authUser.id, clientIp);

      res.status(200).json({
        success: true,
        data: {
          recoveryCodes: result.recoveryCodes,
        },
        message: 'Recovery codes regenerated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/disable
   * Authenticated (Requires password + TOTP/recovery code + recent AAL2)
   * Revokes all user sessions and forces re-login.
   */
  static async disableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser) throw AppError.unauthorized('Authentication required');
      const { password, code } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';

      await MfaService.disableMfa(authUser.id, password, code, clientIp);

      clearAuthCookies(res);
      clearMfaPendingCookie(res);

      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully. Please log in again.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/users/:userId/mfa/reset
   * Authenticated Admin (Requires admin role + recent admin AAL2 + mandatory reason)
   */
  static async adminResetMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser) throw AppError.unauthorized('Authentication required');

      const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const { reason } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';

      await MfaService.adminResetMfa(authUser.id, targetUserId, reason, clientIp);

      res.status(200).json({
        success: true,
        message: 'User MFA reset successfully by admin',
      });
    } catch (error) {
      next(error);
    }
  }
}
