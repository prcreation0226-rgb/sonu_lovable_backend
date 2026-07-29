// Radiantilyk EMR — Staff Profile Routes
// Express router for staff profiles, location assignments, and availability.

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
 * @access  Public — needed for calendar, scheduling, and booking pages
 */
router.get(
  '/',
  StaffController.getStaffProfiles
);

/**
 * @route   GET /api/v1/staff/:id
 * @desc    Get detailed staff profile by ID
 * @access  Public — needed for profile/availability display
 */
router.get(
  '/:id',
  StaffController.getStaffById
);

/**
 * @route   GET /api/v1/staff/:id/availability
 * @desc    Get availability schedule for a staff member
 * @access  Public — needed for scheduling
 */
router.get(
  '/:id/availability',
  StaffController.getStaffAvailability
);

/**
 * @route   POST /api/v1/staff/create-with-user
 * @desc    Create user account AND staff profile together
 * @access  Public / Admin
 */
router.post(
  '/create-with-user',
  optionalAuth,
  StaffController.createStaffWithUser
);

/**
 * @route   POST /api/v1/staff
 * @desc    Create staff profile for a user account
 * @access  Admin, Medical Director
 */
router.post(
  '/',
  authenticate,
  requireRoles('admin', 'medical_director'),
  validate({ body: CreateStaffProfileSchema }),
  StaffController.createStaffProfile
);

/**
 * @route   PATCH /api/v1/staff/:id
 * @desc    Update staff profile details
 * @access  Admin, Medical Director
 */
router.patch(
  '/:id',
  authenticate,
  requireRoles('admin', 'medical_director'),
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
 * @access  Admin, Medical Director
 */
router.post(
  '/:id/locations',
  authenticate,
  requireRoles('admin', 'medical_director'),
  validate({ body: AssignStaffLocationSchema }),
  StaffController.assignLocation
);

/**
 * @route   POST /api/v1/staff/:id/availability
 * @desc    Set availability schedule for a staff member
 * @access  Admin, Medical Director, Nurse Practitioner, Scheduler
 */
router.post(
  '/:id/availability',
  authenticate,
  requireRoles('admin', 'medical_director', 'nurse_practitioner', 'scheduler'),
  validate({ body: StaffAvailabilitySchema }),
  StaffController.setAvailability
);

export default router;
