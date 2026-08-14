// Radiantilyk EMR — Google Calendar Integration Controller (R-03)
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { GoogleCalendarService } from '../services/googleCalendar.service';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';

export class GoogleCalendarController {
  /**
   * GET /api/v1/compliance/google-calendar/auth-url
   * Generate Google OAuth authorization URL for authenticated staff/admin.
   */
  static async getAuthUrl(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const staff = await prisma.staffProfile.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!staff) {
        throw AppError.notFound('Staff profile not found for authenticated user');
      }

      const authUrl = GoogleCalendarService.getAuthUrl(staff.id);
      res.status(200).json({
        success: true,
        data: { authUrl, isServerConfigured: GoogleCalendarService.isConfigured() },
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/google-calendar/callback
   * Process OAuth callback authorization code.
   */
  static async handleCallback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, state } = req.body;
      if (!code) throw AppError.badRequest('Authorization code is required');

      let staffId = '';
      if (state) {
        try {
          const parsed = JSON.parse(decodeURIComponent(state));
          staffId = parsed.staffId;
        } catch {
          staffId = state;
        }
      }

      if (!staffId) {
        const staff = await prisma.staffProfile.findFirst({
          where: { userId: req.user!.id, deletedAt: null },
        });
        if (!staff) throw AppError.notFound('Staff profile not found');
        staffId = staff.id;
      }

      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await GoogleCalendarService.handleOAuthCallback(code, staffId, actingUserId, ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/google-calendar/status
   * Get Google Calendar connection status for authenticated staff.
   */
  static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const staff = await prisma.staffProfile.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!staff) {
        res.status(200).json({
          success: true,
          data: { connected: false, isServerConfigured: GoogleCalendarService.isConfigured() },
        });
        return;
      }

      const status = await GoogleCalendarService.getCalendarStatus(staff.id);
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/google-calendar/disconnect
   * Disconnect Google Calendar integration for staff member.
   */
  static async disconnect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const staff = await prisma.staffProfile.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!staff) throw AppError.notFound('Staff profile not found');

      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await GoogleCalendarService.disconnectCalendar(staff.id, userId, ip);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/google-calendar/sync-appointment/:id
   * Manually trigger Google Calendar sync for an appointment.
   */
  static async syncAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointmentId = req.params.id as string;
      const actingUserId = req.user!.id;

      const result = await GoogleCalendarService.syncAppointmentCreated(appointmentId, actingUserId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }
}
