// Radiantilyk EMR — Consent Management Zod Schemas
// Validation for ConsentTemplate CRUD, ConsentVersion, ConsentAssignment, and ConsentSignature.

import { z } from 'zod';

// ---- Consent Template Schemas ----

export const CreateConsentTemplateSchema = z.object({
  name: z.string().min(3).max(255).trim(),
  content: z.string().min(10).trim(),
  serviceId: z.string().uuid().optional(),
});

export const UpdateConsentTemplateSchema = z.object({
  name: z.string().min(3).max(255).trim().optional(),
  content: z.string().min(10).trim().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ---- Consent Version Schemas ----

export const CreateConsentVersionSchema = z.object({
  content: z.string().min(10).trim(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
});

// ---- Consent Assignment Schemas ----

export const CreateConsentAssignmentSchema = z.object({
  patientId: z.string().uuid(),
  templateId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

// ---- Consent Signature Schemas ----

export const SignConsentSchema = z.object({
  signatureData: z.string().min(10, 'Signature data required'),
  clientEmail: z.string().email(),
});

// ---- Type Exports ----

export type CreateConsentTemplateInput = z.infer<typeof CreateConsentTemplateSchema>;
export type UpdateConsentTemplateInput = z.infer<typeof UpdateConsentTemplateSchema>;
export type CreateConsentVersionInput = z.infer<typeof CreateConsentVersionSchema>;
export type CreateConsentAssignmentInput = z.infer<typeof CreateConsentAssignmentSchema>;
export type SignConsentInput = z.infer<typeof SignConsentSchema>;
