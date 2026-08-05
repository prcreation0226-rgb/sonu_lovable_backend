// Radiantilyk EMR — Appointment & Scheduling Routes
// Express router for Appointment CRUD, status workflow transitions, online booking, time off, and waitlists.
//
// RBAC Rules:
// 1. GET /api/v1/appointments — Read-only schedule access for Admin, Front Desk, NP, RN, and Medical Director (clinical oversight).
// 2. POST /api/v1/appointments (and status/reschedule/cancel) — Restricted to SCHEDULING_ROLES (admin, front_desk, nurse_practitioner, rn_injector). Medical Director denied scheduling write operations.

import { Router } from 'express';
import { AppointmentController } from '../controllers/appointment.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, SCHEDULING_ROLES, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  TransitionStatusSchema,
  RescheduleAppointmentSchema,
  CancelAppointmentSchema,
  PublicBookingRequestSchema,
  StaffTimeOffSchema,
  WaitlistSchema,
} from '../schemas/appointment.schema';

const router = Router();

// ---- Public Route (Rate-Limited Online Booking Request) ----

/**
 * @route   POST /api/v1/appointments/public-booking
 * @desc    Submit public online booking request
 * @access  Public
 */
router.post(
  '/public-booking',
  authLimiter,
  validate({ body: PublicBookingRequestSchema }),
  AppointmentController.createPublicBookingRequest
);

// ---- Read-Only Schedule Routes ----

/**
 * @route   GET /api/v1/appointments/pending-count
 * @desc    Get count of pending appointments
 * @access  Internal Staff
 */
router.get(
  '/pending-count',
  AppointmentController.getPendingCount
);

/**
 * @route   GET /api/v1/appointments
 * @desc    List / Calendar View appointments with location, staff, date range filters
 * @access  All internal staff & Medical Director (Read-only oversight)
 */
router.get(
  '/',
  authenticate,
  requireRoles(...STAFF_ROLES),
  AppointmentController.getAppointments
);

/**
 * @route   GET /api/v1/appointments/:id
 * @desc    Get detailed Appointment by ID
 * @access  All internal staff & Medical Director (Read-only oversight)
 */
router.get(
  '/:id',
  authenticate,
  requireRoles(...STAFF_ROLES),
  AppointmentController.getAppointmentById
);

// ---- Protected Write Routes (Requires JWT Authentication + Live Role Check) ----
router.use(authenticate);

/**
 * @route   POST /api/v1/appointments
 * @desc    Create new Appointment
 * @access  Scheduling Roles (Admin, Front Desk, NP, RN) — Medical Director denied write access
 */
router.post(
  '/',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: CreateAppointmentSchema }),
  AppointmentController.createAppointment
);

/**
 * @route   POST /api/v1/appointments/:id/status
 * @desc    Transition Appointment Status (State Machine Enforcement)
 * @access  Scheduling Roles (Admin, Front Desk, NP, RN) — Medical Director denied status transitions
 */
router.post(
  '/:id/status',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: TransitionStatusSchema }),
  AppointmentController.transitionStatus
);

/**
 * @route   POST /api/v1/appointments/:id/reschedule
 * @desc    Reschedule Appointment
 * @access  Scheduling Roles
 */
router.post(
  '/:id/reschedule',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: RescheduleAppointmentSchema }),
  AppointmentController.rescheduleAppointment
);

/**
 * @route   POST /api/v1/appointments/:id/cancel
 * @desc    Cancel Appointment with reason
 * @access  Scheduling Roles
 */
router.post(
  '/:id/cancel',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: CancelAppointmentSchema }),
  AppointmentController.cancelAppointment
);

/**
 * @route   POST /api/v1/appointments/staff/:staffId/time-off
 * @desc    Request Staff Time Off
 * @access  Admin, NP, RN, Front Desk
 */
router.post(
  '/staff/:staffId/time-off',
  requireRoles('admin', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: StaffTimeOffSchema }),
  AppointmentController.createStaffTimeOff
);

/**
 * @route   POST /api/v1/appointments/waitlist
 * @desc    Add Patient to Waitlist
 * @access  Scheduling Roles
 */
router.post(
  '/waitlist',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: WaitlistSchema }),
  AppointmentController.createWaitlistEntry
);

export default router;
