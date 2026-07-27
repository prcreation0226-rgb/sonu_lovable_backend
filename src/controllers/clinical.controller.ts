// Radiantilyk EMR — Clinical Controller
// Express route handlers for Encounters, SOAP Notes, Cosigns, Addendums, and Cosign Queue.

import { Request, Response, NextFunction } from 'express';
import { ClinicalService } from '../services/clinical.service';
import { AuthenticatedRequest } from '../types';

export class ClinicalController {
  // ---- Encounters ----

  static async createEncounter(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const encounter = await ClinicalService.createEncounter(req.body, userId, ip);

      res.status(201).json({ success: true, data: encounter, message: 'Encounter created successfully' });
    } catch (error) { next(error); }
  }

  static async getEncounterById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encounter = await ClinicalService.getEncounterById(req.params.id as string);
      res.status(200).json({ success: true, data: encounter });
    } catch (error) { next(error); }
  }

  static async updateEncounterStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const updated = await ClinicalService.updateEncounterStatus(req.params.id as string, req.body.status, userId, ip);

      res.status(200).json({ success: true, data: updated, message: `Encounter status updated to '${req.body.status}'` });
    } catch (error) { next(error); }
  }

  // ---- SOAP Notes & Immutability ----

  static async createSoapNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const note = await ClinicalService.createSoapNote(req.body, userId, ip);

      res.status(201).json({ success: true, data: note, message: 'SOAP note created successfully' });
    } catch (error) { next(error); }
  }

  static async updateSoapNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const updated = await ClinicalService.updateSoapNote(req.params.id as string, req.body, userId, ip);

      res.status(200).json({ success: true, data: updated, message: 'SOAP note updated successfully' });
    } catch (error) { next(error); }
  }

  static async signSoapNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.signSoapNote(req.params.id as string, req.body, userId, ip);

      res.status(200).json({ success: true, data: signed, message: 'SOAP note signed and locked successfully' });
    } catch (error) { next(error); }
  }

  static async addAddendum(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const addendum = await ClinicalService.addAddendum(req.params.id as string, req.body, userId, ip);

      res.status(201).json({ success: true, data: addendum, message: 'Addendum appended to signed SOAP note successfully' });
    } catch (error) { next(error); }
  }

  static async getCosignQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const queue = await ClinicalService.getCosignQueue(userId);

      res.status(200).json({ success: true, data: queue });
    } catch (error) { next(error); }
  }
}
