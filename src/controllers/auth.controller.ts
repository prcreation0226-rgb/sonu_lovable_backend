// Radiantilyk EMR — Auth Controller
// Express route handlers for authentication endpoints.

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class AuthController {
  /**
   * POST /api/v1/auth/login
   * Public — authenticate with email & password.
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const result = await AuthService.login(req.body, ip, userAgent);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: result.mfaRequired ? 'MFA verification required' : 'Login successful',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/login-verify
   * Public (with MFA challenge token) — verify 6-digit TOTP code during login.
   */
  static async verifyMfaLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mfaToken, code } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const result = await AuthService.verifyMfaLogin(mfaToken, code, ip, userAgent);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'MFA verified and login successful',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh-token
   * Public — rotate refresh token and receive new access token.
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const tokens = await AuthService.refreshTokens(refreshToken, ip, userAgent);

      const response: ApiResponse = {
        success: true,
        data: tokens,
        message: 'Tokens refreshed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Protected — invalidate current session and refresh tokens.
   */
  static async logout(req: AuthenticatedRequest, res: Response, _next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const sessionId = req.user?.sessionId;
      const ip = req.clientIp || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      if (userId && sessionId) {
        await AuthService.logout(userId, sessionId, ip, userAgent).catch(() => {});
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch {
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    }
  }

  /**
   * GET /api/v1/auth/me
   * Protected — get current authenticated user profile and roles.
   */
  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const response: ApiResponse = {
        success: true,
        data: {
          user: req.user,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/setup
   * Protected — generate TOTP QR secret for user.
   */
  static async setupMfa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await AuthService.setupMfa(userId);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'MFA setup initiated. Scan QR code and verify with code.',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/verify
   * Protected — verify code to enable MFA.
   */
  static async verifyMfaSetup(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { code } = req.body;
      const ip = req.clientIp || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      await AuthService.verifyMfaSetup(userId, code, ip, userAgent);

      const response: ApiResponse = {
        success: true,
        message: 'MFA enabled successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/password/change
   * Protected — change password with current password & history check.
   */
  static async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = req.clientIp || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      await AuthService.changePassword(userId, req.body, ip, userAgent);

      const response: ApiResponse = {
        success: true,
        message: 'Password changed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}
