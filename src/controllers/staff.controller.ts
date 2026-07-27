// Radiantilyk EMR — Staff Profile Controller
// Express route handlers for staff profile CRUD, clinic location assignments, and availability schedules.

import { Request, Response, NextFunction } from 'express';
import { StaffService } from '../services/staff.service';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class StaffController {
  /**
   * POST /api/v1/staff
   * Protected (admin, medical_director) — Create a staff profile for a user.
   */
  static async createStaffProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const staff = await StaffService.createStaffProfile(req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: staff,
        message: 'Staff profile created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/staff
   * Protected (staff roles) — List staff profiles.
   */
  static async getStaffProfiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const activeOnly = req.query.activeOnly !== 'false';

      const result = await StaffService.getStaffProfiles(page, limit, activeOnly);

      const response: ApiResponse = {
        success: true,
        data: result.staff,
        meta: result.meta,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/staff/:id
   * Protected (staff roles) — Get detailed staff profile by ID.
   */
  static async getStaffById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staffId = (req.params.id as string);
      const staff = await StaffService.getStaffById(staffId);

      const response: ApiResponse = {
        success: true,
        data: staff,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/staff/:id
   * Protected (admin, medical_director) — Update staff profile details.
   */
  static async updateStaffProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const staffId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await StaffService.updateStaffProfile(staffId, req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: updated,
        message: 'Staff profile updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/staff/:id
   * Protected (admin) — Soft-delete a staff profile.
   */
  static async deleteStaffProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const staffId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      await StaffService.deleteStaffProfile(staffId, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        message: 'Staff profile soft-deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/staff/:id/locations
   * Protected (admin, medical_director) — Assign staff member to a location.
   */
  static async assignLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const staffId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const assignment = await StaffService.assignLocation(staffId, req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: assignment,
        message: 'Staff location assigned successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/staff/:id/availability
   * Protected (admin, medical_director, nurse_practitioner, scheduler) — Set availability schedule.
   */
  static async setAvailability(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const staffId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const availability = await StaffService.setAvailability(staffId, req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: availability,
        message: 'Staff availability set successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/staff/:id/availability
   * Protected (staff roles) — Get availability schedule for a staff member.
   */
  static async getStaffAvailability(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staffId = (req.params.id as string);
      const availability = await StaffService.getStaffAvailability(staffId);

      const response: ApiResponse = {
        success: true,
        data: availability,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}
