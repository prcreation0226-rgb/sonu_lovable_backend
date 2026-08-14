// Radiantilyk EMR — Vendor Management Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { VendorService } from '../services/vendor.service';

export class VendorController {
  /**
   * GET /api/v1/compliance/vendors
   * List all vendors.
   */
  static async getVendors(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, baaStatus, includeInactive } = req.query;
      const vendors = await VendorService.getVendors({
        category: category as string,
        baaStatus: baaStatus as string,
        includeInactive: includeInactive === 'true',
      });
      res.status(200).json({
        success: true,
        data: vendors,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/vendors/:id
   * Get vendor by ID.
   */
  static async getVendorById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const vendor = await VendorService.getVendorById(id);
      res.status(200).json({
        success: true,
        data: vendor,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/vendors
   * Create vendor record.
   */
  static async createVendor(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actingUserId = req.user!.id;
      const vendor = await VendorService.createVendor(req.body, actingUserId);
      res.status(201).json({
        success: true,
        data: vendor,
      });
    } catch (error) { next(error); }
  }

  /**
   * PATCH /api/v1/compliance/vendors/:id
   * Update vendor record or BAA status.
   */
  static async updateVendor(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actingUserId = req.user!.id;
      const updated = await VendorService.updateVendor(id, req.body, actingUserId);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) { next(error); }
  }

  /**
   * DELETE /api/v1/compliance/vendors/:id
   * Soft-delete / deactivate vendor record.
   */
  static async archiveVendor(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const actingUserId = req.user!.id;
      const archived = await VendorService.archiveVendor(id, actingUserId);
      res.status(200).json({
        success: true,
        data: archived,
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /api/v1/compliance/vendors/baa-dashboard
   * Vendor BAA compliance dashboard & expiration status (R-52).
   */
  static async getBaaDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dashboard = await VendorService.getBaaDashboard();
      res.status(200).json({
        success: true,
        data: dashboard,
      });
    } catch (error) { next(error); }
  }

  /**
   * POST /api/v1/compliance/vendors/baa-reminders/process
   * Run server-side vendor BAA reminder engine (R-52).
   */
  static async processBaaReminders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const actingUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await VendorService.processBaaReminders(actingUserId, ip);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) { next(error); }
  }
}

