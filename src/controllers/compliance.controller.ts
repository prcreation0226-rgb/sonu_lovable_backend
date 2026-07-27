// Radiantilyk EMR — Compliance & Audit Controller
// Express handlers for BreachReports, Policies, Training, Disclosures, and Audit Logs.

import { Request, Response, NextFunction } from 'express';
import { ComplianceService } from '../services/compliance.service';
import { AuthenticatedRequest } from '../types';

export class ComplianceController {
  // ---- Breach Reports ----

  static async createBreachReport(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const report = await ComplianceService.createBreachReport(req.body, userId, ip);
      res.status(201).json({ success: true, data: report, message: 'Breach report filed successfully' });
    } catch (error) { next(error); }
  }

  static async getBreachReports(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const reports = await ComplianceService.getBreachReports();
      res.status(200).json({ success: true, data: reports });
    } catch (error) { next(error); }
  }

  static async getBreachReportById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await ComplianceService.getBreachReportById(req.params.id as string);
      res.status(200).json({ success: true, data: report });
    } catch (error) { next(error); }
  }

  static async updateBreachReport(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const report = await ComplianceService.updateBreachReport(req.params.id as string, req.body, userId, ip);
      res.status(200).json({ success: true, data: report, message: 'Breach report updated successfully' });
    } catch (error) { next(error); }
  }

  // ---- Policies ----

  static async createPolicyVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const version = await ComplianceService.createPolicyVersion(req.body, userId, ip);
      res.status(201).json({ success: true, data: version, message: 'Policy version created successfully' });
    } catch (error) { next(error); }
  }

  static async getPolicies(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const policies = await ComplianceService.getPolicies();
      res.status(200).json({ success: true, data: policies });
    } catch (error) { next(error); }
  }

  // ---- Training Records ----

  static async createTrainingRecord(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const record = await ComplianceService.createTrainingRecord(req.body, userId, ip);
      res.status(201).json({ success: true, data: record, message: 'Training record created successfully' });
    } catch (error) { next(error); }
  }

  static async getStaffTrainingRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const records = await ComplianceService.getStaffTrainingRecords(req.params.staffId as string);
      res.status(200).json({ success: true, data: records });
    } catch (error) { next(error); }
  }

  // ---- External Disclosures ----

  static async createExternalDisclosure(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const disclosure = await ComplianceService.createExternalDisclosure(req.body, userId, ip);
      res.status(201).json({ success: true, data: disclosure, message: 'External disclosure recorded successfully' });
    } catch (error) { next(error); }
  }

  static async getPatientDisclosures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const disclosures = await ComplianceService.getPatientDisclosures(req.params.patientId as string);
      res.status(200).json({ success: true, data: disclosures });
    } catch (error) { next(error); }
  }

  // ---- Audit Logs ----

  static async queryAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ComplianceService.queryAuditLogs(req.query as any);
      res.status(200).json({ success: true, data: result.logs, meta: result.meta });
    } catch (error) { next(error); }
  }

  static async queryPhiAccessLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ComplianceService.queryPhiAccessLogs(req.query as any);
      res.status(200).json({ success: true, data: result.logs, meta: result.meta });
    } catch (error) { next(error); }
  }
}
