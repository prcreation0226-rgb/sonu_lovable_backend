// Radiantilyk EMR — Patient Controller
// Express route handlers for Patient Profiles, Demographics, Medical History, Allergies, 
// Medications, Documents, Photos, Communication Preferences, and CMIA Deletion Requests.

import { Request, Response, NextFunction } from 'express';
import { PatientService } from '../services/patient.service';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class PatientController {
  static async createPatient(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const patient = await PatientService.createPatient(req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: patient,
        message: 'Patient profile created successfully',
      });
    } catch (error) { next(error); }
  }

  static async getPatients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const result = await PatientService.getPatients(page, limit, search);

      res.status(200).json({
        success: true,
        data: result.patients,
        meta: result.meta,
      });
    } catch (error) { next(error); }
  }

  static async getPatientById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patientId = (req.params.id as string);
      const patient = await PatientService.getPatientById(patientId);

      res.status(200).json({
        success: true,
        data: patient,
      });
    } catch (error) { next(error); }
  }

  static async updatePatient(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await PatientService.updatePatient(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Patient profile updated successfully',
      });
    } catch (error) { next(error); }
  }

  static async softDeletePatient(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      await PatientService.softDeletePatient(patientId, userId, ip);

      res.status(200).json({
        success: true,
        message: 'Patient profile soft-deleted successfully',
      });
    } catch (error) { next(error); }
  }

  static async upsertDemographics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const demographics = await PatientService.upsertDemographics(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: demographics,
        message: 'Patient demographics updated successfully',
      });
    } catch (error) { next(error); }
  }

  static async addMedicalHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const history = await PatientService.addMedicalHistory(patientId, req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: history,
        message: 'Medical condition added successfully',
      });
    } catch (error) { next(error); }
  }

  static async addAllergy(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const allergy = await PatientService.addAllergy(patientId, req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: allergy,
        message: 'Allergy added successfully',
      });
    } catch (error) { next(error); }
  }

  static async addMedication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const medication = await PatientService.addMedication(patientId, req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: medication,
        message: 'Medication added successfully',
      });
    } catch (error) { next(error); }
  }

  static async requestDocumentUpload(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientService.requestDocumentUpload(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Presigned document upload URL generated',
      });
    } catch (error) { next(error); }
  }

  static async requestPhotoUpload(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientService.requestPhotoUpload(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Presigned photo upload URL generated',
      });
    } catch (error) { next(error); }
  }

  static async getDocumentDownloadUrl(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const documentId = (req.params.docId as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientService.getDocumentDownloadUrl(documentId, userId, ip);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  static async upsertCommPref(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const pref = await PatientService.upsertCommPref(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: pref,
        message: 'Communication preferences updated successfully',
      });
    } catch (error) { next(error); }
  }

  static async submitCmiaDeletionRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const patientId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const result = await PatientService.submitCmiaDeletionRequest(patientId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await PatientService.getPatientProfileByUserId(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) { next(error); }
  }

  static async getMyAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const appointments = await PatientService.getMyAppointments(userId);

      res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) { next(error); }
  }

  static async getMyConsents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const consents = await PatientService.getMyConsents(userId);

      res.status(200).json({
        success: true,
        data: consents,
      });
    } catch (error) { next(error); }
  }

  static async recordPublicMarketingConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.ip || '0.0.0.0') as string;
      const result = await PatientService.recordPublicMarketingConsent(req.body, ip);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Marketing consent recorded successfully',
      });
    } catch (error) { next(error); }
  }

  static async verifyUnsubscribeToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query.token as string) || '';
      const result = await PatientService.verifyUnsubscribeToken(token);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  static async executePublicUnsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.ip || '0.0.0.0') as string;
      const token = req.body.token as string;
      const result = await PatientService.executePublicUnsubscribe(token, ip);
      res.status(200).json({
        success: true,
        data: result,
        message: 'Successfully unsubscribed from marketing communications',
      });
    } catch (error) { next(error); }
  }

  static async exportMedicalRecord(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || req.ip || '0.0.0.0') as string;
      const userAgent = req.headers['user-agent'] as string | undefined;
      const sections = req.query.sections as string | undefined;

      const result = await PatientService.exportMedicalRecord(userId, sections, ip, userAgent);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  static async createAmendmentRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || req.ip || '0.0.0.0') as string;
      const result = await PatientService.createAmendmentRequest(userId, req.body, ip);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Amendment request submitted successfully',
      });
    } catch (error) { next(error); }
  }

  static async getMyAmendmentRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await PatientService.getMyAmendmentRequests(userId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }

  // ---- NPP Acknowledgment (R-36) ----

  static async getNppStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const status = await PatientService.getNppStatus(userId);
      res.status(200).json({ success: true, data: status });
    } catch (error) { next(error); }
  }

  static async acknowledgeNpp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const { nppVersion } = req.body;

      if (!nppVersion || typeof nppVersion !== 'string' || nppVersion.trim().length < 4) {
        res.status(400).json({ success: false, message: 'Valid nppVersion is required' });
        return;
      }

      const result = await PatientService.acknowledgeNpp(userId, nppVersion.trim(), ip);
      res.status(200).json({
        success: true,
        data: result,
        message: result.alreadyAcknowledged
          ? 'NPP already acknowledged for this version'
          : 'Notice of Privacy Practices acknowledged successfully',
      });
    } catch (error) { next(error); }
  }
}



