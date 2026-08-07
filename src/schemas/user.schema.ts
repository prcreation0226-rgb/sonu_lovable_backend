// Radiantilyk EMR — User & Staff Management Validation Schemas
// Zod schemas for user account operations, role assignment, staff profile management, and availability.

import { z } from 'zod';
import { PasswordSchema } from './auth.schema';

// ---- User Management Schemas ----

export const CreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: PasswordSchema,
  roleNames: z.array(z.string().min(1)).min(1, 'At least one role is required'),
});

export const UpdateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
  isActive: z.boolean().optional(),
});

export const AssignRoleSchema = z.object({
  roleName: z.string().min(1, 'Role name is required'),
});

export const LockUnlockUserSchema = z.object({
  lock: z.boolean(),
  reason: z.string().optional(),
});

// ---- Staff Profile Schemas ----

export const CreateStaffProfileSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(255),
  title: z.string().min(1, 'Title is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  phone: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color code').optional(),
  npiNumber: z.string().length(10, 'NPI number must be exactly 10 digits').optional().nullable(),
  licenseNumber: z.string().max(50).optional().nullable(),
  licenseState: z.string().length(2, 'License state must be 2-letter state code').optional().nullable(),
  licenseExpiry: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  isOwner: z.boolean().optional(),
  hourlyRateCents: z.number().int().nonnegative().optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
});

export const UpdateStaffProfileSchema = CreateStaffProfileSchema.partial().omit({ userId: true }).extend({
  roleName: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  full_name: z.string().min(2).max(255).optional(),
  is_active: z.boolean().optional(),
});

export const AssignStaffLocationSchema = z.object({
  locationId: z.string().uuid('Invalid location ID'),
  isPrimary: z.boolean().optional(),
});

export const StaffAvailabilitySchema = z.object({
  locationId: z.string().uuid('Invalid location ID'),
  dayOfWeek: z.number().int().min(0).max(6), // 0=Sunday, 6=Saturday
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:mm format'),
  isRecurring: z.boolean().optional(),
});

export const RolePermissionSchema = z.object({
  permissionCode: z.string().min(1, 'Permission code is required'),
});

// Inferred Types
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
export type LockUnlockUserInput = z.infer<typeof LockUnlockUserSchema>;
export type CreateStaffProfileInput = z.infer<typeof CreateStaffProfileSchema>;
export type UpdateStaffProfileInput = z.infer<typeof UpdateStaffProfileSchema>;
export type AssignStaffLocationInput = z.infer<typeof AssignStaffLocationSchema>;
export type StaffAvailabilityInput = z.infer<typeof StaffAvailabilitySchema>;
