// Radiantilyk EMR — Appointment & Scheduling Validation Schemas
// Strict Zod schemas for Appointment CRUD, status transitions, online booking, time off, and waitlist.

import { z } from 'zod';
import { AppointmentStatus, AppointmentSource } from '@prisma/client';

export const CreateAppointmentSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  staffId: z.string().uuid('Invalid staff ID'),
  locationId: z.string().uuid('Invalid location ID'),
  serviceIds: z.array(z.string().uuid('Invalid service ID')).min(1, 'At least one service is required'),
  startAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)),
  endAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)).optional(),
  notes: z.string().max(1000).optional().nullable(),
  internalNotes: z.string().max(1000).optional().nullable(),
  source: z.nativeEnum(AppointmentSource).default(AppointmentSource.STAFF),
});

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial().omit({ patientId: true });

export const TransitionStatusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  reason: z.string().max(500).optional().nullable(),
});

export const RescheduleAppointmentSchema = z.object({
  startAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)),
  endAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)).optional(),
  reason: z.string().max(500).optional().nullable(),
});

export const CancelAppointmentSchema = z.object({
  cancellationReason: z.string().min(3, 'Cancellation reason required').max(500),
});

export const PublicBookingRequestSchema = z.object({
  firstName: z.string().trim().min(1, 'First name required').max(100),
  lastName: z.string().trim().min(1, 'Last name required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  phone: z.string().min(10, 'Valid phone number required').max(20),
  staffId: z.string().uuid('Invalid staff ID').or(z.literal('any-available')).or(z.literal('00000000-0000-0000-0000-000000000000')),
  locationId: z.string().uuid('Invalid location ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  startAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)),
  notes: z.string().max(1000).optional().nullable(),
});

export const StaffTimeOffSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().max(500).optional().nullable(),
});

export const WaitlistSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  serviceId: z.string().uuid('Invalid service ID').optional().nullable(),
  locationId: z.string().uuid('Invalid location ID').optional().nullable(),
  preferredDays: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

// Inferred Types
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type TransitionStatusInput = z.infer<typeof TransitionStatusSchema>;
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentSchema>;
export type PublicBookingRequestInput = z.infer<typeof PublicBookingRequestSchema>;
export type StaffTimeOffInput = z.infer<typeof StaffTimeOffSchema>;
export type WaitlistInput = z.infer<typeof WaitlistSchema>;
