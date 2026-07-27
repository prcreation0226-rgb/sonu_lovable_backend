// Radiantilyk EMR — Inventory & Lot Tracking Zod Schemas
// Validation for Products, InventoryLots, TreatmentUsage, and InventoryMovements.

import { z } from 'zod';

// ---- Product Schemas ----

export const CreateProductSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  sku: z.string().max(100).trim().optional(),
  description: z.string().max(2000).trim().optional(),
  category: z.string().max(100).trim().optional(),
  unit: z.string().max(50).trim().default('units'),
  minReorderLevel: z.number().int().min(0).default(10),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(2).max(255).trim().optional(),
  sku: z.string().max(100).trim().nullable().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  category: z.string().max(100).trim().nullable().optional(),
  unit: z.string().max(50).trim().optional(),
  minReorderLevel: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ---- Inventory Lot Schemas ----

export const CreateInventoryLotSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(2).max(255).trim(),
  lotNumber: z.string().min(1).max(100).trim(),
  quantity: z.number().int().min(1),
  unit: z.string().max(50).trim().default('units'),
  vendorId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  costPerUnitCents: z.number().int().min(0).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

// ---- Treatment Usage Schemas ----

export const RecordTreatmentUsageSchema = z.object({
  encounterId: z.string().uuid(),
  lotId: z.string().uuid(),
  unitsUsed: z.number().int().min(1),
  bodySite: z.string().max(100).trim().optional(),
});

// ---- Inventory Movement Schemas ----

const MOVEMENT_TYPES = ['received', 'used', 'adjusted', 'wasted', 'returned'] as const;

export const CreateInventoryMovementSchema = z.object({
  lotId: z.string().uuid(),
  movementType: z.enum(MOVEMENT_TYPES),
  quantityChange: z.number().int(),
  reason: z.string().max(2000).trim().optional(),
  patientId: z.string().uuid().optional(),
  encounterId: z.string().uuid().optional(),
});

// ---- Type Exports ----

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type CreateInventoryLotInput = z.infer<typeof CreateInventoryLotSchema>;
export type RecordTreatmentUsageInput = z.infer<typeof RecordTreatmentUsageSchema>;
export type CreateInventoryMovementInput = z.infer<typeof CreateInventoryMovementSchema>;
