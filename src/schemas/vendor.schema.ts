// Radiantilyk EMR — Vendor Management Validation Schemas
import { z } from 'zod';

export const CreateVendorSchema = z.object({
  name: z.string().trim().min(2, 'Vendor name must be at least 2 characters').max(255),
  category: z.string().trim().max(100).optional().nullable(),
  touchesPhi: z.boolean().optional(),
  baaRequired: z.boolean().optional(),
  baaStatus: z.enum(['signed', 'pending', 'not_required', 'expired']).optional(),
  baaSignedAt: z.string().optional().nullable(),
  baaRenewalAt: z.string().optional().nullable(),
  contactName: z.string().trim().max(255).optional().nullable(),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const UpdateVendorSchema = CreateVendorSchema.partial();

export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;
