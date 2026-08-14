// Radiantilyk EMR — Compliance & Audit Routes
// Express router enforcing Auth + RBAC + Zod Validation + Audit on all compliance endpoints.
// Restricted to COMPLIANCE_ROLES (admin, privacy_officer) for most endpoints.

import { Router } from 'express';
import { ComplianceController } from '../controllers/compliance.controller';
import { HipaaDeviceController } from '../controllers/hipaaDevice.controller';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES, COMPLIANCE_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { auditPhiAccess } from '../middleware/audit';
import {
  CreateBreachReportSchema,
  UpdateBreachReportSchema,
  CreatePolicyVersionSchema,
  CreateHipaaPolicySchema,
  UpdatePolicyStatusSchema,
  AcknowledgePolicySchema,
  CreateStaffTrainingSchema,
  CreateExternalDisclosureSchema,
  QueryAuditLogSchema,
} from '../schemas/compliance.schema';

const router = Router();

// All compliance endpoints require authentication
router.use(authenticate);

// ---- Breach Reports ----

router.post(
  '/breach-reports',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateBreachReportSchema }),
  ComplianceController.createBreachReport
);

router.get(
  '/breach-reports',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getBreachReports
);

router.get(
  '/breach-reports/:id',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getBreachReportById
);

router.patch(
  '/breach-reports/:id',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: UpdateBreachReportSchema }),
  ComplianceController.updateBreachReport
);

// ---- Policies ----

router.post(
  '/policies',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreatePolicyVersionSchema }),
  ComplianceController.createPolicyVersion
);

router.get(
  '/policies',
  requireRoles(...STAFF_ROLES),
  ComplianceController.getPolicies
);

router.post(
  '/policies/create',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateHipaaPolicySchema }),
  ComplianceController.createHipaaPolicy
);

router.patch(
  '/policies/:id/status',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: UpdatePolicyStatusSchema }),
  ComplianceController.updatePolicyStatus
);

router.get(
  '/policies/:id/versions',
  requireRoles(...STAFF_ROLES),
  ComplianceController.getPolicyVersions
);

router.get(
  '/policies/:id/approvals',
  requireRoles(...STAFF_ROLES),
  ComplianceController.getPolicyApprovals
);

router.post(
  '/policies/:id/acknowledge',
  requireRoles(...STAFF_ROLES),
  validate({ body: AcknowledgePolicySchema }),
  ComplianceController.acknowledgePolicy
);

router.get(
  '/policies/:id/acknowledgements',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getPolicyAcknowledgements
);

// ---- Training Records ----

router.post(
  '/training-records',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateStaffTrainingSchema }),
  ComplianceController.createTrainingRecord
);

router.get(
  '/training-records',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getAllTrainingRecords
);

router.get(
  '/training-records/staff/:staffId',
  requireRoles(...COMPLIANCE_ROLES, ...STAFF_ROLES),
  ComplianceController.getStaffTrainingRecords
);

router.post(
  '/training-records/:id/complete',
  requireRoles(...STAFF_ROLES),
  ComplianceController.completeTrainingRecord
);

router.post(
  '/annual-hipaa/acknowledge',
  requireRoles(...STAFF_ROLES),
  ComplianceController.acknowledgeAnnualHipaa
);

router.get(
  '/annual-hipaa/dashboard',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getAnnualHipaaDashboard
);



// ---- External Disclosures ----

router.post(
  '/external-disclosures',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateExternalDisclosureSchema }),
  auditPhiAccess('patient_profile', 'export'),
  ComplianceController.createExternalDisclosure
);

router.get(
  '/external-disclosures/patient/:patientId',
  requireRoles(...COMPLIANCE_ROLES),
  auditPhiAccess('patient_profile', 'view'),
  ComplianceController.getPatientDisclosures
);

// ---- Audit Logs ----

router.get(
  '/audit-logs',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ query: QueryAuditLogSchema }),
  ComplianceController.queryAuditLogs
);

router.get(
  '/phi-access-logs',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ query: QueryAuditLogSchema }),
  ComplianceController.queryPhiAccessLogs
);

// ---- HIPAA IT Device & Media Register (§164.310(d)) ----

router.get(
  '/hipaa-devices',
  requireRoles(...COMPLIANCE_ROLES),
  HipaaDeviceController.listDevices
);

router.get(
  '/hipaa-devices/:id',
  requireRoles(...COMPLIANCE_ROLES),
  HipaaDeviceController.getDeviceById
);

router.post(
  '/hipaa-devices',
  requireRoles('admin', 'privacy_officer'),
  HipaaDeviceController.createDevice
);

router.patch(
  '/hipaa-devices/:id',
  requireRoles('admin', 'privacy_officer'),
  HipaaDeviceController.updateDevice
);

router.post(
  '/hipaa-devices/:id/decommission',
  requireRoles('admin', 'privacy_officer'),
  HipaaDeviceController.decommissionOrDisposeDevice
);

// ---- Marketing Recipient Consent Gate ----

import { SecurityIncidentController } from '../controllers/securityIncident.controller';
import {
  CreateIncidentSchema,
  UpdateIncidentSchema,
  AssessBreachSchema,
} from '../schemas/securityIncident.schema';

router.get(
  '/marketing-recipients',
  requireRoles(...COMPLIANCE_ROLES),
  ComplianceController.getMarketingRecipients
);

// ---- Security Incidents & CMIA Assessment ----

router.post(
  '/incidents',
  requireRoles(...STAFF_ROLES),
  validate({ body: CreateIncidentSchema }),
  SecurityIncidentController.createIncident
);

router.get(
  '/incidents',
  requireRoles(...COMPLIANCE_ROLES),
  SecurityIncidentController.getIncidents
);

router.get(
  '/incidents/:id',
  requireRoles(...COMPLIANCE_ROLES),
  SecurityIncidentController.getIncidentById
);

router.patch(
  '/incidents/:id',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: UpdateIncidentSchema }),
  SecurityIncidentController.updateIncident
);

router.post(
  '/incidents/:id/assess-breach',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: AssessBreachSchema }),
  SecurityIncidentController.assessBreach
);

// ---- Breach & Incident Monitoring Summary (R-44) ----
router.get(
  '/breach-monitoring',
  requireRoles('admin', 'privacy_officer', 'medical_director'),
  SecurityIncidentController.getBreachMonitoringSummary
);


// ---- Vendor Management & BAA Tracking ----

import { VendorController } from '../controllers/vendor.controller';
import { CreateVendorSchema, UpdateVendorSchema } from '../schemas/vendor.schema';

router.get(
  '/vendors',
  requireRoles(...COMPLIANCE_ROLES),
  VendorController.getVendors
);

router.get(
  '/vendors/:id',
  requireRoles(...COMPLIANCE_ROLES),
  VendorController.getVendorById
);

router.post(
  '/vendors',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: CreateVendorSchema }),
  VendorController.createVendor
);

router.patch(
  '/vendors/:id',
  requireRoles(...COMPLIANCE_ROLES),
  validate({ body: UpdateVendorSchema }),
  VendorController.updateVendor
);

router.delete(
  '/vendors/:id',
  requireRoles(...COMPLIANCE_ROLES),
  VendorController.archiveVendor
);

// ---- Vendor Annual BAA Reminders Engine (R-52) ----

router.get(
  '/vendors-baa/dashboard',
  requireRoles(...COMPLIANCE_ROLES),
  VendorController.getBaaDashboard
);

router.post(
  '/vendors-baa/reminders/process',
  requireRoles(...COMPLIANCE_ROLES),
  VendorController.processBaaReminders
);

// ---- Google Calendar Sync & OAuth (R-03) ----
import { GoogleCalendarController } from '../controllers/googleCalendar.controller';

router.get(
  '/google-calendar/auth-url',
  requireRoles(...STAFF_ROLES),
  GoogleCalendarController.getAuthUrl
);

router.post(
  '/google-calendar/callback',
  requireRoles(...STAFF_ROLES),
  GoogleCalendarController.handleCallback
);

router.get(
  '/google-calendar/status',
  requireRoles(...STAFF_ROLES),
  GoogleCalendarController.getStatus
);

router.post(
  '/google-calendar/disconnect',
  requireRoles(...STAFF_ROLES),
  GoogleCalendarController.disconnect
);

router.post(
  '/google-calendar/sync-appointment/:id',
  requireRoles(...STAFF_ROLES),
  GoogleCalendarController.syncAppointment
);


export default router;






