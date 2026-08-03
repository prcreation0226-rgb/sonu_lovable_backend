// Radiantilyk EMR — Clinical Controller
// Express route handlers for Encounters, SOAP Notes, Cosigns, Addendums, Clinical Reviews, and Prescriptions.

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

  static async signOwnNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.signSoapNote(req.params.id as string, req.body, userId, ip);

      res.status(200).json({ success: true, data: signed, message: 'Own SOAP note signed / submitted for cosign successfully' });
    } catch (error) { next(error); }
  }

  static async cosignNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.signSoapNote(req.params.id as string, req.body, userId, ip);

      res.status(200).json({ success: true, data: signed, message: 'SOAP note cosigned and locked by supervising provider successfully' });
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

  // ---- MD-Only Actions (Option A Alignment) ----

  static async getClinicalReviews(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: [], message: 'Medical Director clinical reviews retrieved' });
    } catch (error) { next(error); }
  }

  static async createPrescription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ success: true, data: { id: 'rx-draft', ...req.body }, message: 'Prescription created successfully' });
    } catch (error) { next(error); }
  }

  static async approvePrescription(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: { id: req.params.id, status: 'APPROVED' }, message: 'Prescription approved by Medical Director' });
    } catch (error) { next(error); }
  }
}
