// Radiantilyk EMR — Billing & Payments Zod Schemas
// Validation for Invoices, Payments, Refunds, PatientCredits, and NoShowCharges.
// PCI-compliant: No raw card data or PHI in Stripe metadata.

import { z } from 'zod';

// ---- Invoice Schemas ----

const InvoiceItemSchema = z.object({
  serviceId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  description: z.string().min(1).max(255).trim(),
  unitPriceCents: z.number().int().min(0),
  quantity: z.number().int().min(1).default(1),
});

export const CreateInvoiceSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  items: z.array(InvoiceItemSchema).min(1, 'At least one invoice item required'),
  discountCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

// ---- Payment Schemas ----

const PAYMENT_METHODS = ['credit_card', 'debit_card', 'cash', 'check', 'stripe', 'patient_credit', 'package'] as const;

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  amountCents: z.number().int().min(1),
  tipCents: z.number().int().min(0).default(0),
  discountCents: z.number().int().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  stripePaymentId: z.string().max(255).optional(),
});

// ---- Refund Schemas ----

export const CreateRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  reason: z.string().min(5).max(2000).trim(),
  stripeRefundId: z.string().max(255).optional(),
});

// ---- Patient Credit Schemas ----

export const CreatePatientCreditSchema = z.object({
  patientId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  reason: z.string().min(3).max(255).trim(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

// ---- No-Show Charge Schemas ----

export const CreateNoShowChargeSchema = z.object({
  appointmentId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  paymentMethodId: z.string().uuid().optional(),
});

// ---- Type Exports ----

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;
export type CreateRefundInput = z.infer<typeof CreateRefundSchema>;
export type CreatePatientCreditInput = z.infer<typeof CreatePatientCreditSchema>;
export type CreateNoShowChargeInput = z.infer<typeof CreateNoShowChargeSchema>;
