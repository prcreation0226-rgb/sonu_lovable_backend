// Radiantilyk EMR — AI Scribe Controller (R-34)
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { AiScribeService } from '../services/aiScribe.service';
import { AppError } from '../utils/AppError';

export class AiScribeController {
  /**
   * POST /api/v1/clinical/ai-scribe/generate
   * Generate structured draft SOAP content from encounter transcript.
   */
  static async generate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await AiScribeService.generateDraftSoap(req.body, actingUserId, ip);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/clinical/ai-scribe/apply-to-note
   * Apply AI draft content to an existing draft SOAP note record.
   */
  static async applyToNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { noteId, draftContent } = req.body;
      if (!noteId) throw AppError.badRequest('noteId is required');

      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await AiScribeService.applyDraftToSoapNote(noteId, draftContent, actingUserId, ip);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/clinical/ai-scribe/status
   * Check if AI Scribe provider is configured in environment.
   */
  static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const isConfigured = AiScribeService.isConfigured();
      res.status(200).json({
        success: true,
        data: { isConfigured },
      });
    } catch (error) { next(error); }
  }
}
