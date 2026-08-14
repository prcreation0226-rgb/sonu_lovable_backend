// Radiantilyk EMR — VO Alert Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { VoAlertService } from '../services/voAlert.service';

export class VoAlertController {
  /**
   * POST /api/v1/clinical/vo-alert-oncall (and /api/vo-alert-oncall)
   * Process VO alert trigger and server-side authoritative primary / backup reroute dispatch.
   */
  static async triggerAlert(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const triggeringUserId = req.user?.id;
      const result = await VoAlertService.processVoAlert(req.body || {}, triggeringUserId);

      res.status(200).json({
        success: result.success,
        data: result,
      });
    } catch (error) { next(error); }
  }
}
