// Radiantilyk EMR — SMS Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { SmsService } from '../services/sms.service';

export class SmsController {
  /**
   * GET /api/v1/sms/status
   * Health & configuration status check for SMS provider.
   */
  static async getStatus(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = SmsService.getStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/sms/send-appointment-confirmation
   */
  static async sendAppointmentConfirmation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await SmsService.sendAppointmentConfirmationSMS({
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
   * POST /api/v1/sms/send-appointment-reminder
   */
  static async sendAppointmentReminder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await SmsService.sendAppointmentReminderSMS({
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
   * POST /api/v1/sms/send-appointment-cancellation
   */
  static async sendAppointmentCancellation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await SmsService.sendAppointmentCancellationSMS({
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
   * POST /api/v1/sms/send-generic
   */
  static async sendGenericSms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const result = await SmsService.sendTransactionalSMS({
        ...req.body,
        smsType: 'GENERIC',
        userId,
      });
      res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result,
      });
    } catch (error) { next(error); }
  }
}
