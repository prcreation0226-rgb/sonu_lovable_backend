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
      const roles = req.user!.roles || [];
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.signOwnNote(req.params.id as string, req.body, userId, roles, ip);

      res.status(200).json({ success: true, data: signed, message: 'Own SOAP note signed / submitted for cosign successfully' });
    } catch (error) { next(error); }
  }

  static async cosignNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.cosignNote(req.params.id as string, req.body, userId, ip);

      res.status(200).json({ success: true, data: signed, message: 'SOAP note cosigned successfully' });
    } catch (error) { next(error); }
  }

  static async rejectNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const updated = await ClinicalService.rejectNote(req.params.id as string, req.body.reason, userId, ip);

      res.status(200).json({ success: true, data: updated, message: 'SOAP note returned for correction' });
    } catch (error) { next(error); }
  }

  static async signSoapNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const signed = await ClinicalService.cosignNote(req.params.id as string, req.body, userId, ip);

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

  static async getSoapNotes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientId = req.query.patientId as string | undefined;
      const email = (req.query.email || req.query.clientEmail) as string | undefined;
      const notes = await ClinicalService.getSoapNotes(patientId, email);

      res.status(200).json({ success: true, data: notes });
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

  static async getMdComplianceQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = req.query.month as string | undefined;
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const queue = await ClinicalService.getMdComplianceQueue({ month, status, type });
      res.status(200).json({ success: true, data: queue });
    } catch (error) { next(error); }
  }

  static async bulkSignMdDocuments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const { items, signatureData } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: 'No documents provided for bulk signing' });
        return;
      }
      const result = await ClinicalService.bulkSignMdDocuments(items, userId, ip, signatureData);
      res.status(200).json({ success: true, data: result, message: `Successfully bulk signed ${result.signedCount} document(s)` });
    } catch (error) { next(error); }
  }

  static async getMdComplianceReport(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = req.query.month as string | undefined;
      const report = await ClinicalService.getMdComplianceReport(month);
      res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
  }

  static async getMdNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = await ClinicalService.getMdNotifications(userId);
      res.status(200).json({ success: true, data: data.notifications });
    } catch (error) { next(error); }
  }

  static async getAmendmentRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string | undefined;
      const result = await ClinicalService.getAmendmentRequests({ status });
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async reviewAmendmentRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || req.ip || '0.0.0.0') as string;
      const requestId = req.params.id as string;
      const result = await ClinicalService.reviewAmendmentRequest(requestId, req.body, userId, ip);
      res.status(200).json({
        success: true,
        data: result,
        message: `Amendment request updated to '${result.status}'`,
      });
    } catch (error) { next(error); }
  }
}

