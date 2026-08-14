// Radiantilyk EMR — Email Validation Schemas
import { z } from 'zod';

export const SendWelcomeEmailSchema = z.object({
  to: z.string().trim().email('Valid email address required'),
  name: z.string().trim().min(1, 'Name is required').max(150),
  patientId: z.string().uuid().optional(),
});

export const SendPasswordResetEmailSchema = z.object({
  to: z.string().trim().email('Valid email address required'),
  resetUrl: z.string().trim().url('Valid reset URL required'),
});

export const SendAppointmentConfirmationEmailSchema = z.object({
  to: z.string().trim().email('Valid email address required'),
  patientName: z.string().trim().min(1, 'Patient name required').max(150),
  appointmentDate: z.string().trim().min(1, 'Appointment date required').max(100),
  serviceName: z.string().trim().min(1, 'Service name required').max(200),
  patientId: z.string().uuid().optional(),
});

export const SendGenericEmailSchema = z.object({
  to: z.string().trim().email('Valid email address required'),
  subject: z.string().trim().min(1, 'Subject required').max(200),
  html: z.string().trim().min(1, 'HTML body required').max(50000),
  text: z.string().trim().max(50000).optional(),
});

export type SendWelcomeEmailInput = z.infer<typeof SendWelcomeEmailSchema>;
export type SendPasswordResetEmailInput = z.infer<typeof SendPasswordResetEmailSchema>;
export type SendAppointmentConfirmationEmailInput = z.infer<typeof SendAppointmentConfirmationEmailSchema>;
export type SendGenericEmailInput = z.infer<typeof SendGenericEmailSchema>;
