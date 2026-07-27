// Radiantilyk EMR — Auth Module Request Validation Schemas
// Strict Zod schemas for all authentication, MFA, session, and password endpoints.

import { z } from 'zod';

// ---- Password Rules ----
// Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password must not exceed 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// ---- Auth Schemas ----

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const MfaLoginSchema = z.object({
  mfaToken: z.string().min(1, 'MFA challenge token is required'),
  code: z.string().length(6, 'MFA code must be exactly 6 digits').regex(/^\d+$/, 'MFA code must contain only numbers'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const ConfirmPasswordResetSchema = z.object({
  token: z.string().min(1, 'Password reset token is required'),
  newPassword: PasswordSchema,
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
});

export const MfaVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be exactly 6 digits').regex(/^\d+$/, 'MFA code must contain only numbers'),
});

export const MfaDisableSchema = z.object({
  password: z.string().min(1, 'Password is required to disable MFA'),
});

export const RevokeSessionParamSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
});

// Infer types
export type LoginInput = z.infer<typeof LoginSchema>;
export type MfaLoginInput = z.infer<typeof MfaLoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof ConfirmPasswordResetSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;
export type MfaDisableInput = z.infer<typeof MfaDisableSchema>;
