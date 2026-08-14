// Radiantilyk EMR — Security Incident Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { SecurityIncidentService } from '../services/securityIncident.service';

export class SecurityIncidentController {
  /**
   * POST /api/v1/compliance/incidents
   * Report / create new security incident.
   */
  static async createIncident(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const reportingUserId = req.user!.id;
      const incident = await SecurityIncidentService.createIncident(req.body, reportingUserId);
      res.status(201).json({
        success: true,
        data: incident,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/incidents
   * List security incidents with filters.
   */
  static async getIncidents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, severity, page, limit } = req.query;
      const result = await SecurityIncidentService.getIncidents({
        status: status as string,
        severity: severity as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 50,
      });
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/incidents/:id
   * Get single incident detail.
   */
  static async getIncidentById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const incident = await SecurityIncidentService.getIncidentById(id);
      res.status(200).json({
        success: true,
        data: incident,
      });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/v1/compliance/incidents/:id
   * Update incident investigation / status / containment / resolution.
   */
  static async updateIncident(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actingUserId = req.user!.id;
      const updated = await SecurityIncidentService.updateIncident(id, req.body, actingUserId);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/incidents/:id/assess-breach
   * CMIA / HIPAA breach determination & R-45 escalation.
   */
  static async assessBreach(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const assessingUserId = req.user!.id;
      const updated = await SecurityIncidentService.assessBreachAndCMIA(id, req.body, assessingUserId);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/breach-monitoring
   * Breach & Incident Monitoring summary & list (R-44).
   */
  static async getBreachMonitoringSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {

    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await SecurityIncidentService.getBreachMonitoringSummary(userId, ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }
}

