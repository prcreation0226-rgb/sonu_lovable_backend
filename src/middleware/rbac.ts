// Radiantilyk EMR — Role-Based Access Control (RBAC) Middleware
// Enforces action-level and role-based access on protected routes.
//
// Role Alignment (Option A):
// 1. Clinical Reviews: MD-only (medical_director). Admin denied unless MD role assigned.
// 2. Prescription issue/approval: MD-only (medical_director). Admin denied unless MD role assigned.
// 3. Scheduling Write Actions: admin, front_desk, nurse_practitioner, rn_injector. MD has read-only schedule access.
// 4. Privacy Officer: Read-only minimal staff directory access. Write actions denied.

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRoleName, ErrorCodes } from '../types';
import { AppError } from '../utils/AppError';
import { logger, logSecurityEvent } from '../utils/logger';
import { prisma } from '../config/database';

/**
 * Require the authenticated user to have AT LEAST ONE of the specified roles.
 * Supports multi-role users with union of assigned server roles.
 */
export function requireRoles(...allowedRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      logSecurityEvent(
        'FORBIDDEN_ENDPOINT_ACCESS',
        'high',
        req.clientIp || '0.0.0.0',
        `User ${req.user.id} (roles: ${userRoles.join(',')}) attempted to access route requiring ${allowedRoles.join('|')} — ${req.method} ${req.originalUrl}`
      );

      // Audit Log Event (Requirement 11.H)
      prisma.authAuditLog.create({
        data: {
          userId: req.user.id,
          email: req.user.email,
          eventType: 'AUTHORIZATION_DENIED',
          ipAddress: req.clientIp || '0.0.0.0',
          userAgent: (req.headers['user-agent'] as string) || null,
          metadata: {
            method: req.method,
            url: req.originalUrl,
            userRoles,
            requiredRoles: allowedRoles,
          },
        },
      }).catch(() => {});

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
 * Require the authenticated user to have a role that holds the specified Permission code.
 * Queries Permission -> RolePermission -> Role -> UserRole architecture.
 */
export function requirePermission(permissionCode: string) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
      }

      const userRoles = req.user.roles || [];

      // Query DB for permission and linked roles
      const dbPermission = await prisma.permission.findFirst({
        where: { code: permissionCode },
        include: {
          rolePermissions: {
            include: { role: true },
          },
        },
      });

      const allowedRoleNames = dbPermission && dbPermission.rolePermissions.length > 0
        ? dbPermission.rolePermissions.map((rp) => rp.role.name)
        : ['admin', 'patient_account_manager'];

      const hasPermission = allowedRoleNames.some((r) => userRoles.includes(r as any));

      if (!hasPermission) {
        logSecurityEvent(
          'FORBIDDEN_ENDPOINT_ACCESS',
          'high',
          req.clientIp || '0.0.0.0',
          `User ${req.user.id} (roles: ${userRoles.join(',')}) missing required permission ${permissionCode} — ${req.method} ${req.originalUrl}`
        );

        prisma.authAuditLog.create({
          data: {
            userId: req.user.id,
            email: req.user.email,
            eventType: 'AUTHORIZATION_DENIED',
            ipAddress: req.clientIp || '0.0.0.0',
            userAgent: (req.headers['user-agent'] as string) || null,
            metadata: {
              method: req.method,
              url: req.originalUrl,
              userRoles,
              requiredPermission: permissionCode,
            },
          },
        }).catch(() => {});

        return next(
          new AppError(
            'You do not have permission to access this resource',
            403,
            ErrorCodes.INSUFFICIENT_ROLE
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require the user to have ALL of the specified roles (conjunction).
 */
export function requireAllRoles(...requiredRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles || [];
    const hasAllRoles = requiredRoles.every((role) => userRoles.includes(role));

    if (!hasAllRoles) {
      logSecurityEvent(
        'ELEVATION_ATTEMPT',
        'high',
        req.clientIp || '0.0.0.0',
        `User ${req.user.id} missing required roles ${requiredRoles.join(',')} for ${req.method} ${req.originalUrl}`
      );

      prisma.authAuditLog.create({
        data: {
          userId: req.user.id,
          email: req.user.email,
          eventType: 'AUTHORIZATION_DENIED',
          ipAddress: req.clientIp || '0.0.0.0',
          userAgent: (req.headers['user-agent'] as string) || null,
          metadata: {
            method: req.method,
            url: req.originalUrl,
            userRoles,
            requiredRoles,
          },
        },
      }).catch(() => {});

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
 */
export function denyRoles(...deniedRoles: UserRoleName[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCodes.TOKEN_INVALID));
    }

    const userRoles = req.user.roles || [];
    const isDenied = deniedRoles.some((role) => userRoles.includes(role));

    if (isDenied) {
      prisma.authAuditLog.create({
        data: {
          userId: req.user.id,
          email: req.user.email,
          eventType: 'AUTHORIZATION_DENIED',
          ipAddress: req.clientIp || '0.0.0.0',
          userAgent: (req.headers['user-agent'] as string) || null,
          metadata: {
            method: req.method,
            url: req.originalUrl,
            userRoles,
            deniedRoles,
          },
        },
      }).catch(() => {});

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
export const CLINICAL_ROLES: UserRoleName[] = ['admin', 'medical_director', 'nurse_practitioner', 'rn_injector'];

/** All internal staff (non-patient) */
export const STAFF_ROLES: UserRoleName[] = [
  'admin', 'medical_director', 'nurse_practitioner', 'rn_injector', 'privacy_officer', 'front_desk',
];

/** Compliance and administration roles */
export const COMPLIANCE_ROLES: UserRoleName[] = ['admin', 'privacy_officer'];

/** Scheduling write roles (admin and front_desk only; NP, RN, and MD denied scheduling write actions) */
export const SCHEDULING_ROLES: UserRoleName[] = ['admin', 'front_desk'];
