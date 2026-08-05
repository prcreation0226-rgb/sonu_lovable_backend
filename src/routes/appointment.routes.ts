// Radiantilyk EMR — Appointment & Scheduling Routes
// Express router for Appointment CRUD, status workflow transitions, online booking, time off, and waitlists.
//
// RBAC Rules (Requirement 4):
// 1. GET /api/v1/appointments (and details/pending-count) — Read-only schedule access for Admin, Front Desk, NP, RN, and Medical Director.
// 2. Appointment writes (POST, status, reschedule, cancel) — Restricted strictly to Admin and Front Desk ONLY.
//    NP, RN, and Medical Director write attempts are rejected with 403 Forbidden.

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

// All internal appointment routes require authentication
router.use(authenticate);

// ---- Read-Only Schedule Routes (Admin, Front Desk, NP, RN, Medical Director) ----

/**
 * @route   GET /api/v1/appointments/pending-count
 * @desc    Get count of pending appointments
 * @access  Internal Staff (Admin, Front Desk, NP, RN, Medical Director)
 */
router.get(
  '/pending-count',
  requireRoles(...STAFF_ROLES),
  AppointmentController.getPendingCount
);

/**
 * @route   GET /api/v1/appointments
 * @desc    List / Calendar View appointments with location, staff, date range filters
 * @access  All internal staff & Medical Director (Read-only oversight)
 */
router.get(
  '/',
<<<<<<< HEAD
  authenticate,
=======
>>>>>>> 3086e40538867a28d68c379fd49f14565cb29458
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
<<<<<<< HEAD
  authenticate,
=======
>>>>>>> 3086e40538867a28d68c379fd49f14565cb29458
  requireRoles(...STAFF_ROLES),
  AppointmentController.getAppointmentById
);

// ---- Protected Write Routes (Admin and Front Desk ONLY) ----

/**
 * @route   POST /api/v1/appointments
 * @desc    Create new Appointment
 * @access  Admin & Front Desk ONLY (NP, RN, MD denied write access)
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
 * @access  Admin & Front Desk ONLY (NP, RN, MD denied write access)
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
 * @access  Admin & Front Desk ONLY (NP, RN, MD denied write access)
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
 * @access  Admin & Front Desk ONLY (NP, RN, MD denied write access)
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
 * @access  Admin & Front Desk ONLY
 */
router.post(
  '/staff/:staffId/time-off',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: StaffTimeOffSchema }),
  AppointmentController.createStaffTimeOff
);

/**
 * @route   POST /api/v1/appointments/waitlist
 * @desc    Add Patient to Waitlist
 * @access  Admin & Front Desk ONLY
 */
router.post(
  '/waitlist',
  requireRoles(...SCHEDULING_ROLES),
  validate({ body: WaitlistSchema }),
  AppointmentController.createWaitlistEntry
);

export default router;
