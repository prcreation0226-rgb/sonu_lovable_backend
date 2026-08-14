// Radiantilyk EMR — VO On-Call Alert Routes
import { Router } from 'express';
import { VoAlertController } from '../controllers/voAlert.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { TriggerVoAlertSchema } from '../schemas/voAlert.schema';

const router = Router();

/**
 * @route   POST /api/v1/clinical/vo-alert-oncall
 * @route   POST /api/vo-alert-oncall
 * @desc    Trigger Vascular Occlusion (VO) Protocol On-Call Alert with Authoritative Primary & Escalation Reroute
 * @access  Authenticated Clinical Staff & Admin
 */
router.post(
  '/',
  authenticate,
  requireRoles('admin', 'medical_director', 'nurse_practitioner', 'rn_injector', 'front_desk'),
  validate({ body: TriggerVoAlertSchema }),
  VoAlertController.triggerAlert
);

export default router;
