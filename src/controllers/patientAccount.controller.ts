import { Request, Response, NextFunction } from 'express';
import { PatientAccountService } from '../services/patientAccount.service';
import { AuthenticatedRequest } from '../types';

export class PatientAccountController {
  static async grantManagerAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const staffId = (req.params.staffId as string);
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.grantPatientAccountManager(staffId, adminUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }

  static async revokeManagerAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const staffId = (req.params.staffId as string);
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.revokePatientAccountManager(staffId, adminUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }

  static async getPatientAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await PatientAccountService.getPatientAccounts(search, page, limit);
      res.status(200).json({ success: true, data: result.accounts, meta: result.meta });
    } catch (error) { next(error); }
  }

  static async createPatientLogin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.createPatientLogin(patientProfileId, actingUserId, ip);
      res.status(201).json({ success: true, data: result, message: 'Patient login access created successfully' });
    } catch (error) { next(error); }
  }

  static async activatePatientLogin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.activatePatientLogin(patientProfileId, actingUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }

  static async deactivatePatientLogin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.deactivatePatientLogin(patientProfileId, actingUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }

  static async unlockPatientAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.unlockPatientAccount(patientProfileId, actingUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }

  static async resetPatientAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.resetPatientAccess(patientProfileId, actingUserId, ip);
      res.status(200).json({ success: true, data: result, message: 'Patient access reset successfully' });
    } catch (error) { next(error); }
  }

  static async forcePasswordChange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientProfileId = (req.params.patientProfileId as string);
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientAccountService.forcePasswordChange(patientProfileId, actingUserId, ip);
      res.status(200).json({ success: true, data: result, message: result.message });
    } catch (error) { next(error); }
  }
}
