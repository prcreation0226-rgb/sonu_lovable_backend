// Radiantilyk EMR — Staff Profile Routes
// Express router for staff profiles, location assignments, and availability.
//
// RBAC Rules:
// 1. GET /api/v1/staff — Read-only staff directory access for internal staff & Privacy Officer (compliance audit)
// 2. Write Endpoints (Create, Edit, Delete, Location Assign) — Admin only (Privacy Officer denied write permissions)

import { Router } from 'express';
import { StaffController } from '../controllers/staff.controller';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  CreateStaffProfileSchema,
  UpdateStaffProfileSchema,
  AssignStaffLocationSchema,
  StaffAvailabilitySchema,
} from '../schemas/user.schema';

const router = Router();

/**
 * @route   GET /api/v1/staff
 * @desc    List staff profiles with pagination
 * @access  Internal Staff & Privacy Officer (Read-only for compliance audit)
 */
router.get(
  '/',
  optionalAuth,
  StaffController.getStaffProfiles
);

/**
 * @route   GET /api/v1/staff/:id
 * @desc    Get detailed staff profile by ID
 * @access  Internal Staff & Privacy Officer
 */
router.get(
  '/:id',
  optionalAuth,
  StaffController.getStaffById
);

/**
 * @route   GET /api/v1/staff/:id/availability
 * @desc    Get availability schedule for a staff member
 * @access  Public / Internal Staff
 */
router.get(
  '/:id/availability',
  StaffController.getStaffAvailability
);

/**
 * @route   POST /api/v1/staff/create-with-user
 * @desc    Create user account AND staff profile together
 * @access  Admin Only (Privacy Officer denied)
 */
router.post(
  '/create-with-user',
  authenticate,
  requireRoles(...STAFF_ROLES),
  StaffController.createStaffWithUser
);

/**
 * @route   POST /api/v1/staff
 * @desc    Create staff profile for a user account
 * @access  Admin Only
 */
router.post(
  '/',
  authenticate,
  requireRoles('admin'),
  validate({ body: CreateStaffProfileSchema }),
  StaffController.createStaffProfile
);

/**
 * @route   PATCH /api/v1/staff/:id
 * @desc    Update staff profile details
 * @access  Admin Only
 */
router.patch(
  '/:id',
  authenticate,
  requireRoles('admin'),
  validate({ body: UpdateStaffProfileSchema }),
  StaffController.updateStaffProfile
);

/**
 * @route   DELETE /api/v1/staff/:id
 * @desc    Soft-delete staff profile
 * @access  Admin Only
 */
router.delete(
  '/:id',
  authenticate,
  requireRoles('admin'),
  StaffController.deleteStaffProfile
);

/**
 * @route   POST /api/v1/staff/:id/locations
 * @desc    Assign staff member to a location
 * @access  Admin Only
 */
router.post(
  '/:id/locations',
  authenticate,
  requireRoles('admin'),
  validate({ body: AssignStaffLocationSchema }),
  StaffController.assignLocation
);

/**
 * @route   POST /api/v1/staff/:id/availability
 * @desc    Set availability schedule for a staff member
 * @access  Admin, Nurse Practitioner, RN Injector, Front Desk
 */
router.post(
  '/:id/availability',
  authenticate,
  requireRoles('admin', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: StaffAvailabilitySchema }),
  StaffController.setAvailability
);

export default router;
