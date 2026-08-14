// Radiantilyk EMR — Patient PHI Module Request Validation Schemas
// Strict Zod schemas for Patient Profiles, Demographics, Medical History, Allergies, 
// Medications, Documents, Photos, Communication Preferences, and CMIA Deletion Requests.

import { z } from 'zod';

// ---- Patient Profile Schemas ----

export const CreatePatientSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').optional().nullable(),
  gender: z.enum(['female', 'male', 'non_binary', 'other', 'prefer_not_to_say']).optional().nullable(),
  medicalAlerts: z.string().max(1000).optional().nullable(),
  marketingConsent: z.boolean().optional(),
  nppAcknowledged: z.boolean().optional(),
});

export const UpdatePatientSchema = CreatePatientSchema.partial();

// ---- Demographics Schema ----

export const DemographicsSchema = z.object({
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().length(2, 'State must be 2-letter code').optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
  emergencyName: z.string().max(255).optional().nullable(),
  emergencyPhone: z.string().max(20).optional().nullable(),
  preferredLang: z.string().max(50).default('English'),
  ethnicity: z.string().max(100).optional().nullable(),
  fitzpatrickType: z.enum(['type_1', 'type_2', 'type_3', 'type_4', 'type_5', 'type_6']).optional().nullable(),
  insuranceProvider: z.string().max(255).optional().nullable(),
  policyNumber: z.string().max(100).optional().nullable(),
  groupNumber: z.string().max(100).optional().nullable(),
  referralSource: z.string().max(255).optional().nullable(),
});

// ---- Medical History Schema ----

export const MedicalHistorySchema = z.object({
  condition: z.string().trim().min(1, 'Condition is required').max(255),
  status: z.enum(['active', 'resolved', 'managed', 'inactive']).default('active'),
  diagnosedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ---- Allergy Schema ----

export const AllergySchema = z.object({
  allergen: z.string().trim().min(1, 'Allergen is required').max(255),
  reaction: z.string().max(255).optional().nullable(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life_threatening']).default('moderate'),
});

// ---- Medication Schema ----

export const MedicationSchema = z.object({
  medicationName: z.string().trim().min(1, 'Medication name is required').max(255),
  dosage: z.string().max(100).optional().nullable(),
  frequency: z.string().max(100).optional().nullable(),
  prescribingProvider: z.string().max(255).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// ---- Patient Document Request Presigned Upload Schema ----

export const DocumentUploadRequestSchema = z.object({
  documentType: z.enum(['intake_form', 'lab_result', 'id_card', 'insurance_card', 'prior_medical_record', 'other']),
  fileName: z.string().trim().min(1, 'File name is required').max(255),
  mimeType: z.string().min(1, 'MIME type is required').max(100),
  fileSize: z.number().int().positive().max(50 * 1024 * 1024, 'File size cannot exceed 50 MB'),
});

// ---- Patient Photo Request Presigned Upload Schema ----

export const PhotoUploadRequestSchema = z.object({
  photoType: z.enum(['before', 'after', 'during_treatment', 'baseline', 'adverse_event']),
  fileName: z.string().trim().min(1, 'File name is required').max(255),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/, 'Only JPEG, PNG, and WebP images supported'),
  bodyArea: z.string().max(100).optional().nullable(),
  encounterId: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ---- Communication Preference Schema ----

export const CommPrefSchema = z.object({
  allowEmail: z.boolean().default(true),
  allowSms: z.boolean().default(true),
  allowMarketing: z.boolean().default(false),
});

export const PublicMarketingConsentSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email required').max(255),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  marketingConsent: z.boolean().default(true),
});

export const UnsubscribeTokenSchema = z.object({
  token: z.string().min(1, 'Token required'),
});

// ---- CMIA PHI Deletion Request Schema ----

export const CmiaDeletionRequestSchema = z.object({
  reason: z.string().min(5, 'Reason is required for CMIA PHI deletion request').max(2000),
});

// ---- Export Medical Record Query Schema ----

export const ExportMedicalRecordQuerySchema = z.object({
  sections: z.string().optional(),
});

// ---- Patient Amendment Request Schema ----

export const CreateAmendmentRequestSchema = z.object({
  recordCategory: z.string().trim().min(2, 'Record category required').max(100),
  currentText: z.string().trim().max(5000).optional(),
  requestedCorrection: z.string().trim().min(5, 'Requested correction required').max(5000),
  rationale: z.string().trim().min(5, 'Rationale required').max(5000),
  noteId: z.string().uuid().optional(),
});

// Inferred Types
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;
export type DemographicsInput = z.infer<typeof DemographicsSchema>;
export type MedicalHistoryInput = z.infer<typeof MedicalHistorySchema>;
export type AllergyInput = z.infer<typeof AllergySchema>;
export type MedicationInput = z.infer<typeof MedicationSchema>;
export type DocumentUploadRequestInput = z.infer<typeof DocumentUploadRequestSchema>;
export type PhotoUploadRequestInput = z.infer<typeof PhotoUploadRequestSchema>;
export type CommPrefInput = z.infer<typeof CommPrefSchema>;
export type PublicMarketingConsentInput = z.infer<typeof PublicMarketingConsentSchema>;
export type UnsubscribeTokenInput = z.infer<typeof UnsubscribeTokenSchema>;
export type CmiaDeletionRequestInput = z.infer<typeof CmiaDeletionRequestSchema>;
export type ExportMedicalRecordQueryInput = z.infer<typeof ExportMedicalRecordQuerySchema>;
export type CreateAmendmentRequestInput = z.infer<typeof CreateAmendmentRequestSchema>;



