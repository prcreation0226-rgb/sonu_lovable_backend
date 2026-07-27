// Radiantilyk EMR — User & Permission Controller
// Express route handlers for user accounts, role assignments, locking/unlocking, and permissions.

import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { AuthenticatedRequest, ApiResponse, UserRoleName } from '../types';

export class UserController {
  /**
   * POST /api/v1/users
   * Protected (admin, privacy_officer) — Create a new user account with assigned roles.
   */
  static async createUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const user = await UserService.createUser(req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: user,
        message: 'User created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/users
   * Protected (admin, privacy_officer) — Get list of user accounts with pagination.
   */
  static async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const result = await UserService.getUsers(page, limit, search);

      const response: ApiResponse = {
        success: true,
        data: result.users,
        meta: result.meta,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/users/:id
   * Protected (admin, privacy_officer) — Get detailed user account by ID.
   */
  static async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req.params.id as string);
      const user = await UserService.getUserById(userId);

      const response: ApiResponse = {
        success: true,
        data: user,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/users/:id
   * Protected (admin, privacy_officer) — Update user details (email, active status).
   */
  static async updateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const userId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await UserService.updateUser(userId, req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: updated,
        message: 'User updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/users/:id/lock
   * Protected (admin, privacy_officer) — Lock or unlock user account.
   */
  static async lockUnlockUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const userId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await UserService.lockUnlockUser(userId, req.body, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: updated,
        message: req.body.lock ? 'Account locked successfully' : 'Account unlocked successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/users/:id
   * Protected (admin) — Soft-delete user account.
   */
  static async deleteUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const userId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      await UserService.deleteUser(userId, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        message: 'User account soft-deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/users/:id/roles
   * Protected (admin) — Assign a role to a user.
   */
  static async assignRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const userId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updatedUser = await UserService.assignRole(userId, req.body.roleName as UserRoleName, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: updatedUser,
        message: `Role '${req.body.roleName}' assigned successfully`,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/users/:id/roles/:roleName
   * Protected (admin) — Remove a role from a user.
   */
  static async removeRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const userId = (req.params.id as string);
      const roleName = (req.params.roleName as UserRoleName);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updatedUser = await UserService.removeRole(userId, roleName, adminUserId, ip);

      const response: ApiResponse = {
        success: true,
        data: updatedUser,
        message: `Role '${roleName}' removed successfully`,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/roles
   * Protected (admin, privacy_officer) — List all roles & permissions.
   */
  static async getRolesAndPermissions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await UserService.getRolesAndPermissions();

      const response: ApiResponse = {
        success: true,
        data: roles,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/roles/:roleName/permissions
   * Protected (admin) — Assign permission code to a role.
   */
  static async assignPermissionToRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const roleName = (req.params.roleName as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updatedRoles = await UserService.assignPermissionToRole(
        roleName,
        req.body.permissionCode,
        adminUserId,
        ip
      );

      const response: ApiResponse = {
        success: true,
        data: updatedRoles,
        message: 'Permission assigned to role successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}
