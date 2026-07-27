// Radiantilyk EMR — Staff Profile Routes
// Express router for staff profiles, location assignments, and availability.

import { Router } from 'express';
import { StaffController } from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  CreateStaffProfileSchema,
  UpdateStaffProfileSchema,
  AssignStaffLocationSchema,
  StaffAvailabilitySchema,
} from '../schemas/user.schema';

const router = Router();

// All staff management routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/staff
 * @desc    Create staff profile for a user account
 * @access  Admin, Medical Director
 */
router.post(
  '/',
  requireRoles('admin', 'medical_director'),
  validate({ body: CreateStaffProfileSchema }),
  StaffController.createStaffProfile
);

/**
 * @route   GET /api/v1/staff
 * @desc    List staff profiles with pagination
 * @access  All Staff Roles
 */
router.get(
  '/',
  requireRoles(...STAFF_ROLES),
  StaffController.getStaffProfiles
);

/**
 * @route   GET /api/v1/staff/:id
 * @desc    Get detailed staff profile by ID
 * @access  All Staff Roles
 */
router.get(
  '/:id',
  requireRoles(...STAFF_ROLES),
  StaffController.getStaffById
);

/**
 * @route   PATCH /api/v1/staff/:id
 * @desc    Update staff profile details
 * @access  Admin, Medical Director
 */
router.patch(
  '/:id',
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
  requireRoles('admin', 'medical_director', 'nurse_practitioner', 'scheduler'),
  validate({ body: StaffAvailabilitySchema }),
  StaffController.setAvailability
);

/**
 * @route   GET /api/v1/staff/:id/availability
 * @desc    Get availability schedule for a staff member
 * @access  All Staff Roles
 */
router.get(
  '/:id/availability',
  requireRoles(...STAFF_ROLES),
  StaffController.getStaffAvailability
);

export default router;
