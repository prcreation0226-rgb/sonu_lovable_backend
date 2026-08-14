// Radiantilyk EMR — SMS Routes
import { Router } from 'express';
import { SmsController } from '../controllers/sms.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  SendAppointmentConfirmationSmsSchema,
  SendAppointmentReminderSmsSchema,
  SendAppointmentCancellationSmsSchema,
  SendGenericSmsSchema,
} from '../schemas/sms.schema';

const router = Router();

/**
 * @route   GET /api/v1/sms/status
 * @desc    Get SMS provider configuration status
 * @access  Authenticated Staff & Admin
 */
router.get(
  '/status',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  SmsController.getStatus
);

/**
 * @route   POST /api/v1/sms/send-appointment-confirmation
 * @desc    Send appointment confirmation SMS
 * @access  Admin & Staff
 */
router.post(
  '/send-appointment-confirmation',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: SendAppointmentConfirmationSmsSchema }),
  SmsController.sendAppointmentConfirmation
);

/**
 * @route   POST /api/v1/sms/send-appointment-reminder
 * @desc    Send appointment reminder SMS
 * @access  Admin & Staff
 */
router.post(
  '/send-appointment-reminder',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: SendAppointmentReminderSmsSchema }),
  SmsController.sendAppointmentReminder
);

/**
 * @route   POST /api/v1/sms/send-appointment-cancellation
 * @desc    Send appointment cancellation SMS
 * @access  Admin & Staff
 */
router.post(
  '/send-appointment-cancellation',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: SendAppointmentCancellationSmsSchema }),
  SmsController.sendAppointmentCancellation
);

/**
 * @route   POST /api/v1/sms/send-generic
 * @desc    Send generic transactional SMS
 * @access  Admin Only
 */
router.post(
  '/send-generic',
  authenticate,
  requireRoles('admin'),
  validate({ body: SendGenericSmsSchema }),
  SmsController.sendGenericSms
);

export default router;
