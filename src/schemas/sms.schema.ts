// Radiantilyk EMR — SMS Validation Schemas
import { z } from 'zod';

export const SendAppointmentConfirmationSmsSchema = z.object({
  to: z.string().trim().min(10, 'Valid phone number required').max(20),
  patientName: z.string().trim().min(1, 'Patient name required').max(150),
  appointmentDate: z.string().trim().min(1, 'Appointment date required').max(100),
  serviceName: z.string().trim().min(1, 'Service name required').max(200),
  patientId: z.string().uuid().optional(),
});

export const SendAppointmentReminderSmsSchema = z.object({
  to: z.string().trim().min(10, 'Valid phone number required').max(20),
  patientName: z.string().trim().min(1, 'Patient name required').max(150),
  appointmentDate: z.string().trim().min(1, 'Appointment date required').max(100),
  serviceName: z.string().trim().min(1, 'Service name required').max(200),
  patientId: z.string().uuid().optional(),
});

export const SendAppointmentCancellationSmsSchema = z.object({
  to: z.string().trim().min(10, 'Valid phone number required').max(20),
  patientName: z.string().trim().min(1, 'Patient name required').max(150),
  appointmentDate: z.string().trim().min(1, 'Appointment date required').max(100),
  serviceName: z.string().trim().min(1, 'Service name required').max(200),
  patientId: z.string().uuid().optional(),
});

export const SendGenericSmsSchema = z.object({
  to: z.string().trim().min(10, 'Valid phone number required').max(20),
  message: z.string().trim().min(1, 'SMS message required').max(1600),
  patientId: z.string().uuid().optional(),
});

export type SendAppointmentConfirmationSmsInput = z.infer<typeof SendAppointmentConfirmationSmsSchema>;
export type SendAppointmentReminderSmsInput = z.infer<typeof SendAppointmentReminderSmsSchema>;
export type SendAppointmentCancellationSmsInput = z.infer<typeof SendAppointmentCancellationSmsSchema>;
export type SendGenericSmsInput = z.infer<typeof SendGenericSmsSchema>;
