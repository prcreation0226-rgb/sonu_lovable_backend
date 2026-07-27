// Radiantilyk EMR — Role-Based Access Control (RBAC) Middleware
// Enforces role-based and permission-based access on protected routes.
// Roles: admin, medical_director, nurse_practitioner, staff, scheduler, receptionist, privacy_officer, patient

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRoleName, ErrorCodes } from '../types';
import { AppError } from '../utils/AppError';
import { logger, logSecurityEvent } from '../utils/logger';

/**
 * Require the authenticated user to have AT LEAST ONE of the specified roles.
 * 
 * Usage:
 *   router.get('/admin/dashboard', authenticate, requireRoles('admin', 'privacy_officer'), handler);
 */
export function requireRoles(...allowedRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles;
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      logSecurityEvent(
        'FORBIDDEN_ENDPOINT_ACCESS',
        'high',
        req.clientIp || '0.0.0.0',
        `User ${req.user.id} (roles: ${userRoles.join(',')}) attempted to access route requiring ${allowedRoles.join('|')} — ${req.method} ${req.originalUrl}`
      );

      return next(
        new AppError(
          'You do not have permission to access this resource',
          403,
          ErrorCodes.INSUFFICIENT_ROLE
        )
      );
    }

    next();
  };
}

/**
 * Require the user to have ALL of the specified roles (conjunction).
 * Useful for operations requiring multiple role confirmations.
 */
export function requireAllRoles(...requiredRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles;
    const hasAllRoles = requiredRoles.every((role) => userRoles.includes(role));

    if (!hasAllRoles) {
      logSecurityEvent(
        'ELEVATION_ATTEMPT',
        'high',
        req.clientIp || '0.0.0.0',
        `User ${req.user.id} missing required roles ${requiredRoles.join(',')} for ${req.method} ${req.originalUrl}`
      );

      return next(
        new AppError(
          'Insufficient permissions for this operation',
          403,
          ErrorCodes.INSUFFICIENT_ROLE
        )
      );
    }

    next();
  };
}

/**
 * Deny access to specific roles (blacklist).
 * Useful for preventing patients from accessing staff-only resources.
 */
export function denyRoles(...deniedRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles;
    const isDenied = deniedRoles.some((role) => userRoles.includes(role));

    if (isDenied) {
      return next(
        new AppError(
          'You do not have permission to access this resource',
          403,
          ErrorCodes.FORBIDDEN
        )
      );
    }

    next();
  };
}

// ---- Convenience Role Groups ----

/** Clinical staff who can view/edit medical records */
export const CLINICAL_ROLES: UserRoleName[] = ['admin', 'medical_director', 'nurse_practitioner'];

/** All internal staff (non-patient) */
export const STAFF_ROLES: UserRoleName[] = [
  'admin', 'medical_director', 'nurse_practitioner', 'staff', 'scheduler', 'receptionist', 'privacy_officer',
];

/** Compliance and administration roles */
export const COMPLIANCE_ROLES: UserRoleName[] = ['admin', 'privacy_officer'];

/** Scheduling roles */
export const SCHEDULING_ROLES: UserRoleName[] = ['admin', 'scheduler', 'receptionist', 'nurse_practitioner'];
