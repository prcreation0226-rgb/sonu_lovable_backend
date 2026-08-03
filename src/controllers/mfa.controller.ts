import { Request, Response, NextFunction } from 'express';
import { MfaService } from '../services/mfa.service';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest } from '../types';
import {
  setAuthCookies,
  setMfaPendingCookie,
  clearMfaPendingCookie,
  extractMfaPendingToken,
} from '../utils/cookies';
import { AppError } from '../utils/AppError';

export class MfaController {
  /**
   * GET /api/v1/auth/mfa/status
   */
  static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const status = await MfaService.getMfaStatus(userId);
      res.status(200).json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/enroll/start
   */
  static async startEnrollment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const clientIp = req.clientIp || '0.0.0.0';
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
   */
  static async verifyEnrollment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { factorId, code } = req.body;
      const clientIp = req.clientIp || '0.0.0.0';

      if (!factorId || !code) {
        throw AppError.badRequest('factorId and 6-digit code are required');
      }

      const result = await MfaService.verifyEnrollment(userId, factorId, code, clientIp);
      res.status(200).json({
        success: true,
        data: result,
        message: 'MFA enrollment completed and verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/challenge/verify
   */
  static async verifyChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const challengeToken = extractMfaPendingToken(req);
      const { code } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      if (!challengeToken) {
        throw AppError.badRequest('Pending MFA challenge token missing');
      }
      if (!code) {
        throw AppError.badRequest('6-digit MFA verification code is required');
      }

      const verifyResult = await MfaService.verifyChallenge(challengeToken, code, clientIp);
      
      // Issue AAL2 Session & Tokens
      const user = await AuthService.getUserById(verifyResult.userId);
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
        // Look up userId from pending MFA challenge token
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
   * POST /api/v1/auth/mfa/recovery/regenerate
   */
  static async regenerateRecoveryCodes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const clientIp = req.clientIp || '0.0.0.0';
      const result = await MfaService.regenerateRecoveryCodes(userId, clientIp);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Recovery codes regenerated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/disable
   */
  static async disableMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const clientIp = req.clientIp || '0.0.0.0';
      await MfaService.disableMfa(userId, clientIp);
      res.status(200).json({
        success: true,
        message: 'MFA disabled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/users/:userId/mfa/reset
   */
  static async adminResetMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const targetUserId = (Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId) as string;
      const clientIp = req.clientIp || '0.0.0.0';
      await MfaService.adminResetMfa(adminUserId, targetUserId, clientIp);
      res.status(200).json({
        success: true,
        message: `MFA reset for user ${targetUserId} by Admin`,
      });
    } catch (error) {
      next(error);
    }
  }
}
