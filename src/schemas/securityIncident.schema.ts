// Radiantilyk EMR — Security Incident Validation Schemas
import { z } from 'zod';

export const CreateIncidentSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(255),
  incidentType: z.string().trim().min(1, 'Incident type required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  discoveredAt: z.string().datetime().or(z.string().min(10)),
  description: z.string().trim().min(5, 'Description required'),
  affectedSystems: z.string().trim().optional(),
  assignedUserId: z.string().uuid().optional(),
});

export const UpdateIncidentSchema = z.object({
  status: z.enum(['open', 'investigating', 'contained', 'resolved', 'closed']).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  containmentActions: z.string().trim().optional(),
  investigationNotes: z.string().trim().optional(),
  resolution: z.string().trim().optional(),
});

export const AssessBreachSchema = z.object({
  isPhiInvolved: z.boolean(),
  breachDetermined: z.boolean(),
  assessmentRationale: z.string().trim().min(5, 'Rationale required'),
  escalateToBreachReport: z.boolean().optional(),
  patientsAffected: z.number().int().nonnegative().optional(),
});

export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof UpdateIncidentSchema>;
export type AssessBreachInput = z.infer<typeof AssessBreachSchema>;
