// Radiantilyk EMR — Consent Controller
// Express handlers for ConsentTemplate CRUD, Versioning, Assignment, and Signature.

import { Request, Response, NextFunction } from 'express';
import { ConsentService } from '../services/consent.service';
import { AuthenticatedRequest } from '../types';

export class ConsentController {
  // ---- Templates ----

  static async createTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const template = await ConsentService.createTemplate(req.body, userId, ip);
      res.status(201).json({ success: true, data: template, message: 'Consent template created successfully' });
    } catch (error) { next(error); }
  }

  static async getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const templates = await ConsentService.getTemplates(includeInactive);
      res.status(200).json({ success: true, data: templates });
    } catch (error) { next(error); }
  }

  static async getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await ConsentService.getTemplateById(req.params.id as string);
      res.status(200).json({ success: true, data: template });
    } catch (error) { next(error); }
  }

  static async updateTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const template = await ConsentService.updateTemplate(req.params.id as string, req.body, userId, ip);
      res.status(200).json({ success: true, data: template, message: 'Consent template updated successfully' });
    } catch (error) { next(error); }
  }

  static async deleteTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await ConsentService.deleteTemplate(req.params.id as string, userId, ip);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  // ---- Versions ----

  static async createVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const version = await ConsentService.createVersion(req.params.id as string, req.body, userId, ip);
      res.status(201).json({ success: true, data: version, message: 'Consent version created successfully' });
    } catch (error) { next(error); }
  }

  // ---- Assignments ----

  static async createAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const assignment = await ConsentService.createAssignment(req.body, userId, ip);
      res.status(201).json({ success: true, data: assignment, message: 'Consent assigned to patient successfully' });
    } catch (error) { next(error); }
  }

  static async getPatientAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignments = await ConsentService.getPatientAssignments(req.params.patientId as string);
      res.status(200).json({ success: true, data: assignments });
    } catch (error) { next(error); }
  }

  // ---- Signatures ----

  static async signConsent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const userAgent = (req.headers['user-agent'] as string) || '';
      const signature = await ConsentService.signConsent(req.params.id as string, req.body, userId, ip, userAgent);
      res.status(200).json({ success: true, data: signature, message: 'Consent signed successfully' });
    } catch (error) { next(error); }
  }

  static async getSignatureById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = await ConsentService.getSignatureById(req.params.id as string);
      res.status(200).json({ success: true, data: signature });
    } catch (error) { next(error); }
  }
}
