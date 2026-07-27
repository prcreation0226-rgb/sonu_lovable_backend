
// Radiantilyk EMR — PHI Audit Middleware Foundation
// Automatically logs Protected Health Information access events for HIPAA compliance.
// Every request that touches patient data is recorded in the phi_access_logs table.
//
// HIPAA §164.312(b): Implement mechanisms that record and examine activity 
// in information systems that contain or use ePHI.

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { logger, logPhiAccess } from '../utils/logger';

// ---- PHI Resource Types ----
export type PhiResourceType =
  | 'patient_profile'
  | 'medical_history'
  | 'allergy'
  | 'medication'
  | 'soap_note'
  | 'encounter'
  | 'patient_document'
  | 'patient_photo'
  | 'consent_signature'
  | 'gfe_form'
  | 'treatment_plan'
  | 'scribe_session'
  | 'adverse_event'
  | 'inventory_lot'
  | 'invoice'
  | 'payment'
  | 'breach_report'
  | 'external_disclosure'
  | 'training_record';

// ---- PHI Actions ----
export type PhiAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'print'
  | 'download';

/**
 * PHI Audit Middleware Factory.
 * Wraps a route handler to automatically log PHI access AFTER the response is sent.
 * 
 * Usage:
 *   router.get('/patients/:id', authenticate, auditPhiAccess('patient_profile', 'view'), handler);
 */
export function auditPhiAccess(resourceType: PhiResourceType, action: PhiAction) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Capture the original end method to log after response completes
    const originalEnd = res.end;
    const startTime = Date.now();

    // Override res.end to inject audit logging
    res.end = function (this: Response, ...args: any[]): Response {
      // Only log on successful responses (2xx/3xx)
      if (res.statusCode < 400) {
        const userId = req.user?.id;
        const patientId = (req.params.patientId || req.params.id || '') as string;
        const resourceId = (req.params.id || req.params.resourceId || '') as string;
        const ip = (req.clientIp || req.socket.remoteAddress || '0.0.0.0') as string;
        const userAgent = (req.headers['user-agent'] as string) || '';

        if (userId) {
          // Log to file immediately (synchronous)
          logPhiAccess(userId, patientId || 'N/A', action, resourceType, ip as string);

          // Write to database asynchronously (fire-and-forget, non-blocking)
          prisma.phiAccessLog
            .create({
              data: {
                userId,
                patientId: (patientId as string) || '00000000-0000-0000-0000-000000000000',
                action,
                resourceType,
                resourceId: (resourceId as string) || undefined,
                ipAddress: ip,
                userAgent: userAgent.substring(0, 500),
              },
            })
            .catch((err) => {
              logger.error(`[PHI_AUDIT] Failed to write PHI access log to database: ${err.message}`);
            });
        }
      }

      return originalEnd.apply(this, args as any);
    };

    next();
  };
}

/**
 * Log a general audit event to the audit_logs table.
 * Used by services and controllers for non-PHI administrative actions.
 */
export async function writeAuditLog(params: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  ipAddress: string;
  userAgent?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId || undefined,
        patientId: params.patientId || undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent?.substring(0, 500),
        oldValue: params.oldValue ? (sanitizeAuditPayload(params.oldValue) as any) : undefined,
        newValue: params.newValue ? (sanitizeAuditPayload(params.newValue) as any) : undefined,
        phiRedacted: true,
      },
    });
  } catch (error) {
    logger.error(`[AUDIT] Failed to write audit log: ${(error as Error).message}`);
  }
}

// ---- PHI Sanitization for Audit Payloads ----

const PHI_FIELDS_TO_REDACT = new Set([
  'firstName', 'first_name', 'lastName', 'last_name', 'fullName', 'full_name',
  'dateOfBirth', 'date_of_birth', 'ssn', 'socialSecurityNumber',
  'email', 'phone', 'address', 'addressLine1', 'addressLine2',
  'medicalAlerts', 'medical_alerts', 'chiefComplaint', 'chief_complaint',
  'subjective', 'objective', 'assessment', 'plan',
  'policyNumber', 'policy_number', 'groupNumber', 'group_number',
  'insuranceProvider', 'insurance_provider',
  'emergencyName', 'emergency_name', 'emergencyPhone', 'emergency_phone',
  'passwordHash', 'password_hash', 'mfaSecret', 'mfa_secret',
]);

/**
 * Recursively redact PHI fields from an object before storing in audit logs.
 */
function sanitizeAuditPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (PHI_FIELDS_TO_REDACT.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditPayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
