// Radiantilyk EMR — Shared Type Definitions
// Central type definitions used across the backend.

import { Request } from 'express';

// ---- Role Definitions ----
// 6 staff roles + patient portal role.
// Removed legacy: 'staff', 'scheduler', 'receptionist', 'provider'.
// Merged scheduler+receptionist → front_desk; added rn_injector.
export type UserRoleName =
  | 'admin'
  | 'medical_director'
  | 'nurse_practitioner'
  | 'rn_injector'
  | 'privacy_officer'
  | 'front_desk'
  | 'patient';

/** Roles eligible to appear as bookable clinical providers */
export const CLINICAL_PROVIDER_ROLES: UserRoleName[] = [
  'medical_director',
  'nurse_practitioner',
  'rn_injector',
];

// ---- Authenticated Request ----
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRoleName[];
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Client IP, resolved through proxy headers */
  clientIp?: string;
  /** Request ID for tracing */
  requestId?: string;
}

// ---- API Response Envelope ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    perPage?: number;
    total?: number;
    totalPages?: number;
  };
}

// ---- Error Codes ----
export const ErrorCodes = {
  // Auth
  INVALID_CREDENTIALS: 'AUTH_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
  MFA_REQUIRED: 'AUTH_004',
  MFA_INVALID: 'AUTH_005',
  ACCOUNT_LOCKED: 'AUTH_006',
  SESSION_EXPIRED: 'AUTH_007',

  // Authorization
  FORBIDDEN: 'AUTHZ_001',
  INSUFFICIENT_ROLE: 'AUTHZ_002',
  INSUFFICIENT_PERMISSION: 'AUTHZ_003',

  // Validation
  VALIDATION_ERROR: 'VAL_001',
  INVALID_INPUT: 'VAL_002',

  // Resource
  NOT_FOUND: 'RES_001',
  CONFLICT: 'RES_002',
  GONE: 'RES_003',

  // Server
  INTERNAL_ERROR: 'SRV_001',
  SERVICE_UNAVAILABLE: 'SRV_002',
  DATABASE_ERROR: 'SRV_003',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_001',

  // PHI
  PHI_ACCESS_DENIED: 'PHI_001',
  CONSENT_REQUIRED: 'PHI_002',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
