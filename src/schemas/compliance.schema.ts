// Radiantilyk EMR — Compliance & Audit Zod Schemas
// Validation for BreachReports, PolicyVersions, StaffTraining, ExternalDisclosures, and AuditLog queries.

import { z } from 'zod';

// ---- Breach Report Schemas ----

export const CreateBreachReportSchema = z.object({
  breachType: z.string().min(3).max(100).trim(),
  description: z.string().min(10).max(5000).trim(),
  patientsAffected: z.number().int().min(0).default(0),
  phiInvolved: z.boolean().default(false),
  discoveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  remediationSteps: z.string().max(5000).trim().optional(),
});

export const UpdateBreachReportSchema = z.object({
  status: z.enum(['reported', 'under_review', 'notified', 'resolved']).optional(),
  hhsNotificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  caAgNotificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remediationSteps: z.string().max(5000).trim().optional(),
});

// ---- Policy Version Schemas ----

export const CreatePolicyVersionSchema = z.object({
  policyId: z.string().uuid(),
  title: z.string().min(3).max(255).trim(),
  content: z.string().min(10).trim(),
  versionNumber: z.number().int().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---- Staff Training Record Schemas ----

export const CreateStaffTrainingSchema = z.object({
  staffId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  trainingName: z.string().min(3).max(255).trim(),
  score: z.number().int().min(0).max(100).optional(),
  signatureData: z.string().min(5).optional(),
});

// ---- External Disclosure Schemas ----

export const CreateExternalDisclosureSchema = z.object({
  patientId: z.string().uuid(),
  disclosedTo: z.string().min(2).max(255).trim(),
  purpose: z.string().min(5).max(2000).trim(),
  descriptionOfPhi: z.string().min(5).max(2000).trim(),
});

// ---- Audit Log Query Schemas ----

export const QueryAuditLogSchema = z.object({
  userId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  action: z.string().max(50).optional(),
  resourceType: z.string().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

// ---- Type Exports ----

export type CreateBreachReportInput = z.infer<typeof CreateBreachReportSchema>;
export type UpdateBreachReportInput = z.infer<typeof UpdateBreachReportSchema>;
export type CreatePolicyVersionInput = z.infer<typeof CreatePolicyVersionSchema>;
export type CreateStaffTrainingInput = z.infer<typeof CreateStaffTrainingSchema>;
export type CreateExternalDisclosureInput = z.infer<typeof CreateExternalDisclosureSchema>;
export type QueryAuditLogInput = z.infer<typeof QueryAuditLogSchema>;
