// Radiantilyk EMR — Email Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../services/email.service';

export class EmailController {
  /**
   * GET /api/v1/email/status
   * Health and configuration check for email provider.
   */
  static async getStatus(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = EmailService.getStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/email/send-welcome
   */
  static async sendWelcomeEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await EmailService.sendWelcomeEmail({
        ...req.body,
        userId,
      });
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/email/send-appointment-confirmation
   */
  static async sendAppointmentConfirmation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await EmailService.sendAppointmentConfirmationEmail(req.body);
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/email/send-generic
   */
  static async sendGenericEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await EmailService.sendTransactionalEmail({
        ...req.body,
        emailType: 'GENERIC',
        userId,
      });
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result,
      });
    } catch (error) { next(error); }
  }
}
