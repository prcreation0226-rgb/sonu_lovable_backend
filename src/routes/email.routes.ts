// Radiantilyk EMR — Email Routes
import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  SendWelcomeEmailSchema,
  SendAppointmentConfirmationEmailSchema,
  SendGenericEmailSchema,
} from '../schemas/email.schema';

const router = Router();

/**
 * @route   GET /api/v1/email/status
 * @desc    Get email provider configuration status
 * @access  Authenticated Staff & Admin
 */
router.get(
  '/status',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  EmailController.getStatus
);

/**
 * @route   POST /api/v1/email/send-welcome
 * @desc    Send account welcome transactional email
 * @access  Admin & Staff
 */
router.post(
  '/send-welcome',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: SendWelcomeEmailSchema }),
  EmailController.sendWelcomeEmail
);

/**
 * @route   POST /api/v1/email/send-appointment-confirmation
 * @desc    Send appointment confirmation transactional email
 * @access  Admin & Staff
 */
router.post(
  '/send-appointment-confirmation',
  authenticate,
  requireRoles('admin', 'privacy_officer', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: SendAppointmentConfirmationEmailSchema }),
  EmailController.sendAppointmentConfirmation
);

/**
 * @route   POST /api/v1/email/send-generic
 * @desc    Send custom secure transactional email
 * @access  Admin Only
 */
router.post(
  '/send-generic',
  authenticate,
  requireRoles('admin'),
  validate({ body: SendGenericEmailSchema }),
  EmailController.sendGenericEmail
);

export default router;
