// Radiantilyk EMR — Staff Profile Controller
// Express route handlers for staff profile CRUD, clinic location assignments, and availability schedules.

import { Request, Response, NextFunction } from 'express';
import { StaffService } from '../services/staff.service';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class StaffController {
  /**
   * POST /api/v1/staff/create-with-user
   * Protected (admin only) — Create both a User account AND Staff Profile in one step.
   */
  static async createStaffWithUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user?.id || 'admin';
      const ip = (req.clientIp || '0.0.0.0') as string;

      const staff = await StaffService.createStaffWithUser(req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: staff,
        message: 'Staff profile and user account created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/staff
   * Protected (admin only) — Create a staff profile for a user.
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
   * Protected (staff roles) — List staff profiles with role-specific field projections (Minimum Necessary Principle).
   */
  static async getStaffProfiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const activeOnly = req.query.activeOnly !== 'false';

      const result = await StaffService.getStaffProfiles(page, limit, activeOnly);

      const userRoles = (req as AuthenticatedRequest).user?.roles || [];
      const isAdmin = userRoles.includes('admin');
      const isPrivacyOfficer = userRoles.includes('privacy_officer');

      const sanitizedStaff = (result.staff || []).map((s: any) => {
        if (isAdmin) return s; // Full authorized management response

        if (isPrivacyOfficer) {
          // Privacy Officer: Minimum audit/compliance fields only
          return {
            id: s.id,
            user_id: s.user_id || s.userId,
            full_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.fullName || s.name,
            email: s.user?.email || s.email,
            roles: s.user?.userRoles?.map((ur: any) => ur.role?.name) || s.roles,
            is_active: s.user?.isActive ?? s.isActive,
            created_at: s.createdAt || s.created_at,
          };
        }

        // Provider oversight / Sanitized scheduling directory fields (Front Desk, NP, RN, MD)
        return {
          id: s.id,
          full_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.fullName || s.name,
          title: s.title,
          specialties: s.specialties,
          is_active: s.user?.isActive ?? s.isActive,
        };
      });

      const response: ApiResponse = {
        success: true,
        data: sanitizedStaff,
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
   * Protected (admin only) — Update staff profile details.
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
   * Protected (admin only) — Soft-delete a staff profile.
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
   * Protected (admin only) — Assign staff member to a location.
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
   * Protected (admin, nurse_practitioner, rn_injector, front_desk) — Set availability schedule.
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
