// Radiantilyk EMR — User & Role Management Routes
// Express router for user accounts, role management, locking/unlocking, and permissions.

import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  CreateUserSchema,
  UpdateUserSchema,
  AssignRoleSchema,
  LockUnlockUserSchema,
  RolePermissionSchema,
} from '../schemas/user.schema';

const router = Router();

// All user management routes require authentication
router.use(authenticate);

// ---- User Account Routes ----

/**
 * @route   POST /api/v1/users
 * @desc    Create new user account with initial roles
 * @access  Admin, Privacy Officer
 */
router.post(
  '/',
  requireRoles('admin', 'privacy_officer'),
  validate({ body: CreateUserSchema }),
  UserController.createUser
);

/**
 * @route   GET /api/v1/users
 * @desc    List user accounts with pagination & search
 * @access  Admin, Privacy Officer, Front Desk, Nurse Practitioner, Medical Director, RN Injector
 */
router.get(
  '/',
  requireRoles('admin', 'privacy_officer', 'front_desk', 'nurse_practitioner', 'medical_director', 'rn_injector'),
  UserController.getUsers
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get detailed user account by ID
 * @access  Admin, Privacy Officer
 */
router.get(
  '/:id',
  requireRoles('admin', 'privacy_officer'),
  UserController.getUserById
);

/**
 * @route   PATCH /api/v1/users/:id
 * @desc    Update user details (email, active status)
 * @access  Admin, Privacy Officer
 */
router.patch(
  '/:id',
  requireRoles('admin', 'privacy_officer'),
  validate({ body: UpdateUserSchema }),
  UserController.updateUser
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Soft-delete user account
 * @access  Admin Only
 */
router.delete(
  '/:id',
  requireRoles('admin'),
  UserController.deleteUser
);

/**
 * @route   POST /api/v1/users/:id/lock
 * @desc    Lock or unlock user account
 * @access  Admin, Privacy Officer
 */
router.post(
  '/:id/lock',
  requireRoles('admin', 'privacy_officer'),
  validate({ body: LockUnlockUserSchema }),
  UserController.lockUnlockUser
);

/**
 * @route   POST /api/v1/users/:id/roles
 * @desc    Assign a role to a user
 * @access  Admin Only
 */
router.post(
  '/:id/roles',
  requireRoles('admin'),
  validate({ body: AssignRoleSchema }),
  UserController.assignRole
);

/**
 * @route   DELETE /api/v1/users/:id/roles/:roleName
 * @desc    Remove a role from a user
 * @access  Admin Only
 */
router.delete(
  '/:id/roles/:roleName',
  requireRoles('admin'),
  UserController.removeRole
);

export default router;

// ---- Roles & Permissions Sub-Router ----
export const roleRouter = Router();
roleRouter.use(authenticate);

/**
 * @route   GET /api/v1/roles
 * @desc    List all roles & associated permissions
 * @access  Admin, Privacy Officer
 */
roleRouter.get(
  '/',
  requireRoles('admin', 'privacy_officer'),
  UserController.getRolesAndPermissions
);

/**
 * @route   POST /api/v1/roles/:roleName/permissions
 * @desc    Assign a permission to a role
 * @access  Admin Only
 */
roleRouter.post(
  '/:roleName/permissions',
  requireRoles('admin'),
  validate({ body: RolePermissionSchema }),
  UserController.assignPermissionToRole
);
