// Radiantilyk EMR — Clinical EMR Module Request Validation Schemas
// Strict Zod schemas for Encounters, SOAP Notes, Addendums, Cosigns, Vitals, Procedures, and Prescriptions.

import { z } from 'zod';
// ---- Encounter Schemas ----

export const CreateEncounterSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  providerId: z.string().uuid('Invalid provider ID'),
  locationId: z.string().uuid('Invalid location ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional().nullable(),
  encounterType: z.enum(['initial_consultation', 'treatment_visit', 'follow_up', 'botox_filler', 'laser_treatment', 'emergency_vascular_occlusion', 'other']).default('treatment_visit'),
  chiefComplaint: z.string().max(1000).optional().nullable(),
});

export const UpdateEncounterSchema = CreateEncounterSchema.partial().omit({ patientId: true });

// ---- SOAP Note Schemas ----

export const CreateSoapNoteSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID'),
  patientId: z.string().uuid('Invalid patient ID'),
  subjective: z.string().min(1, 'Subjective notes required').max(5000),
  objective: z.string().min(1, 'Objective notes required').max(5000),
  assessment: z.string().min(1, 'Assessment required').max(5000),
  plan: z.string().min(1, 'Plan required').max(5000),
  status: z.enum(['draft', 'pending_cosign', 'signed']).default('draft'),
  cosignerId: z.string().uuid('Invalid cosigner ID').optional().nullable(),
});

export const UpdateSoapNoteSchema = z.object({
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  assessment: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
  status: z.enum(['draft', 'pending_cosign']).optional(),
  cosignerId: z.string().uuid('Invalid cosigner ID').optional().nullable(),
});

export const SignSoapNoteSchema = z.object({
  cosignerId: z.string().uuid().optional().nullable(),
  lockNote: z.boolean().default(true),
});

export const RejectSoapNoteSchema = z.object({
  reason: z.string().trim().min(3, 'Rejection reason is required').max(1000),
});

export const AddendumSchema = z.object({
  reason: z.string().trim().min(5, 'Reason for addendum is required').max(500),
  addendumText: z.string().trim().min(10, 'Addendum text must be at least 10 characters').max(5000),
});

// ---- Vitals Schema ----

export const CreateVitalsSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID'),
  patientId: z.string().uuid('Invalid patient ID'),
  systolic: z.number().int().min(50).max(250).optional().nullable(),
  diastolic: z.number().int().min(30).max(150).optional().nullable(),
  pulse: z.number().int().min(30).max(220).optional().nullable(),
  respiratoryRate: z.number().int().min(8).max(60).optional().nullable(),
  temperatureF: z.number().min(90.0).max(110.0).optional().nullable(),
  weightLbs: z.number().min(5.0).max(1000.0).optional().nullable(),
  heightInches: z.number().min(20.0).max(100.0).optional().nullable(),
  spo2: z.number().int().min(50).max(100).optional().nullable(),
});

// ---- Procedure & Treatment Record Schema ----

export const CreateProcedureSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID'),
  patientId: z.string().uuid('Invalid patient ID'),
  serviceId: z.string().uuid('Invalid service ID').optional().nullable(),
  bodyArea: z.string().trim().min(1, 'Body area is required').max(100),
  unitsUsed: z.number().min(0.1, 'Units used must be greater than 0').max(1000),
  lotNumber: z.string().trim().min(1, 'Lot number required for medical tracking').max(100),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiration date must be YYYY-MM-DD'),
  notes: z.string().max(1000).optional().nullable(),
});

// ---- Prescription Schema ----

export const CreatePrescriptionSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID').optional().nullable(),
  patientId: z.string().uuid('Invalid patient ID'),
  medicationName: z.string().trim().min(1, 'Medication name required').max(255),
  dosage: z.string().trim().min(1, 'Dosage required').max(100),
  frequency: z.string().trim().min(1, 'Frequency required').max(100),
  refills: z.number().int().min(0).max(12).default(0),
  quantity: z.number().int().positive('Quantity must be positive'),
  instructions: z.string().max(1000).optional().nullable(),
});

// Inferred Types
export type CreateEncounterInput = z.infer<typeof CreateEncounterSchema>;
export type UpdateEncounterInput = z.infer<typeof UpdateEncounterSchema>;
export type CreateSoapNoteInput = z.infer<typeof CreateSoapNoteSchema>;
export type UpdateSoapNoteInput = z.infer<typeof UpdateSoapNoteSchema>;
export type SignSoapNoteInput = z.infer<typeof SignSoapNoteSchema>;
export type AddendumInput = z.infer<typeof AddendumSchema>;
export type CreateVitalsInput = z.infer<typeof CreateVitalsSchema>;
export type CreateProcedureInput = z.infer<typeof CreateProcedureSchema>;
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionSchema>;
