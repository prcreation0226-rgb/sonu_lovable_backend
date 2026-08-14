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

  static async createHipaaPolicy(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const policy = await ComplianceService.createHipaaPolicy(req.body, userId, ip);
      res.status(201).json({ success: true, data: policy, message: 'HIPAA policy created successfully' });
    } catch (error) { next(error); }
  }

  static async updatePolicyStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const policy = await ComplianceService.updatePolicyStatus(req.params.id as string, req.body, userId, ip);
      res.status(200).json({ success: true, data: policy, message: 'Policy status updated successfully' });
    } catch (error) { next(error); }
  }

  static async getPolicyVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const versions = await ComplianceService.getPolicyVersions(req.params.id as string);
      res.status(200).json({ success: true, data: versions });
    } catch (error) { next(error); }
  }

  static async getPolicyApprovals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const approvals = await ComplianceService.getPolicyApprovals(req.params.id as string);
      res.status(200).json({ success: true, data: approvals });
    } catch (error) { next(error); }
  }

  static async acknowledgePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const ack = await ComplianceService.acknowledgePolicy(req.params.id as string, req.body, userId, ip);
      res.status(201).json({ success: true, data: ack, message: 'Policy acknowledged successfully' });
    } catch (error) { next(error); }
  }

  static async getPolicyAcknowledgements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const acks = await ComplianceService.getPolicyAcknowledgements(req.params.id as string);
      res.status(200).json({ success: true, data: acks });
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

  static async getAllTrainingRecords(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, staffId, isAnnual } = req.query;
      const records = await ComplianceService.getAllTrainingRecords({
        status: status as string,
        staffId: staffId as string,
        isAnnual: isAnnual === 'true' ? true : (isAnnual === 'false' ? false : undefined),
      });
      res.status(200).json({ success: true, data: records });
    } catch (error) { next(error); }
  }

  static async completeTrainingRecord(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const record = await ComplianceService.completeTrainingRecord(id, req.body, userId, ip);
      res.status(200).json({ success: true, data: record, message: 'Training completed successfully' });
    } catch (error) { next(error); }
  }

  static async acknowledgeAnnualHipaa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await ComplianceService.acknowledgeAnnualHipaa(userId, req.body, ip);
      res.status(200).json({
        success: true,
        data: result,
        message: result.alreadyAcknowledged
          ? 'Annual HIPAA training already acknowledged for this version'
          : 'Annual HIPAA training acknowledged successfully',
      });
    } catch (error) { next(error); }
  }

  static async getAnnualHipaaDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dashboard = await ComplianceService.getAnnualHipaaDashboard();
      res.status(200).json({ success: true, data: dashboard });
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

  static async getMarketingRecipients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recipients = await ComplianceService.getMarketingRecipients();
      res.status(200).json({ success: true, data: recipients });
    } catch (error) { next(error); }
  }
}

