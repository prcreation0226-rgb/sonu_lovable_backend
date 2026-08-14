// Radiantilyk EMR — Auth Controller
// Express route handlers for authentication endpoints.
// Phase 1A: HttpOnly cookie-based authentication.
// Tokens are NEVER returned in the JSON response body.

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthenticatedRequest, ApiResponse } from '../types';
import {
  setAuthCookies,
  clearAuthCookies,
  extractRefreshToken,
  setMfaPendingCookie,
  clearMfaPendingCookie,
} from '../utils/cookies';

export class AuthController {
  /**
   * POST /api/v1/auth/login
   * Public — authenticate with email & password.
   * Sets HttpOnly cookies on success. Never returns tokens in JSON.
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const result = await AuthService.login(req.body, ip, userAgent);

      if (result.mfaRequired) {
        if (result.challengeToken) {
          setMfaPendingCookie(res, result.challengeToken);
        }

        const response: ApiResponse = {
          success: true,
          data: {
            mfaRequired: true,
            enrollmentRequired: result.enrollmentRequired,
          },
          message: 'MFA challenge required',
        };
        res.status(202).json(response);
        return;
      }

      // Set auth cookies (access + refresh)
      if (result.tokens) {
        setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
      }

      // Return user info WITHOUT tokens
      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          mustChangePassword: result.user?.mustChangePassword ?? false,
        },
        message: 'Login successful',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/mfa/login-verify
   * Public (with MFA challenge token) — verify 6-digit TOTP code during login.
   * Sets HttpOnly cookies on successful MFA verification.
   */
  static async verifyMfaLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mfaToken, code } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const result = await AuthService.verifyMfaLogin(mfaToken, code, ip, userAgent);

      // Set auth cookies
      if (result.tokens) {
        setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
      }

      const response: ApiResponse = {
        success: true,
        data: { user: result.user },
        message: 'MFA verified and login successful',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh (canonical) and /api/v1/auth/refresh-token (compat)
   * Public — reads refresh token from HttpOnly cookie, rotates tokens.
   * Sets new HttpOnly cookies. Never returns tokens in JSON.
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshTokenStr = extractRefreshToken(req);

      if (!refreshTokenStr) {
        res.status(401).json({
          success: false,
          error: { code: 'AUTH_002', message: 'No refresh token provided' },
        });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const tokens = await AuthService.refreshTokens(refreshTokenStr, ip, userAgent);

      // Set new cookies
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      const response: ApiResponse = {
        success: true,
        message: 'Session refreshed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Protected — invalidate current session and refresh tokens.
   * Clears auth cookies.
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

      // Clear both auth cookies & MFA pending cookie
      clearAuthCookies(res);
      clearMfaPendingCookie(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch {
      // Always clear cookies even on error
      clearAuthCookies(res);
      clearMfaPendingCookie(res);

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
          user: req.user || null,
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

  /**
   * POST /api/v1/auth/verify-phase1a
   * Strictly verifies Phase 1A MySQL Authentication Foundation against the Live Database.
   */
  static async verifyPhase1a(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const userAgent = req.headers['user-agent'] || '';

      const verificationResults = await AuthService.runPhase1aLiveVerification(ip, userAgent);

      res.status(200).json({
        success: true,
        data: verificationResults,
        message: 'Phase 1A Live MySQL Auth Verification completed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/seed-test-accounts
   * Seeds dedicated Phase 1C test accounts in live database.
   */
  static async seedTestAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { action, email, minutes } = req.body || {};
      let data: any;

      if (action === 'age-session') {
        data = await AuthService.ageUserSession(email, minutes || 15);
      } else if (action === 'legacy-count') {
        data = await AuthService.getLegacyColumnCount();
      } else if (action === 'cleanup') {
        data = await AuthService.cleanupTestAccounts();
      } else {
        data = await AuthService.seedTestAccounts();
      }

      res.status(200).json({
        success: true,
        data,
        message: 'Phase 1C test account action completed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
