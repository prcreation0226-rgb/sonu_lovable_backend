// Radiantilyk EMR — Secure Logger with PHI Sanitization
// Healthcare-grade logging: sanitizes Protected Health Information before writing to disk/console.
// PHI fields are detected and replaced with [REDACTED] in all log outputs.
//
// HIPAA §164.312(b): Audit controls — implement hardware, software, and procedural mechanisms 
// that record and examine activity in information systems containing ePHI.

import winston from 'winston';
import path from 'path';
import { env } from '../config/env';

// ---- PHI Field Patterns to Redact ----
const PHI_FIELD_PATTERNS: RegExp[] = [
  // Names
  /("(?:first_?name|last_?name|full_?name|patient_?name|emergency_?name)":\s*)"[^"]*"/gi,
  // Dates of birth
  /("(?:date_?of_?birth|dob)":\s*)"[^"]*"/gi,
  // SSN patterns
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Email addresses in PHI context
  /("(?:patient_?email|client_?email)":\s*)"[^"]*"/gi,
  // Phone numbers in PHI context
  /("(?:patient_?phone|emergency_?phone)":\s*)"[^"]*"/gi,
  // Medical record content
  /("(?:subjective|objective|assessment|plan|chief_?complaint|medical_?alerts|diagnosis)":\s*)"[^"]*"/gi,
  // Addresses
  /("(?:address_?line1|address_?line2)":\s*)"[^"]*"/gi,
  // Insurance
  /("(?:policy_?number|group_?number|insurance_?provider)":\s*)"[^"]*"/gi,
];

/**
 * Sanitize a string by replacing PHI patterns with [REDACTED].
 */
function sanitizePhi(message: string): string {
  let sanitized = message;
  for (const pattern of PHI_FIELD_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, (match, prefix) => {
      if (prefix) {
        return `${prefix}"[REDACTED]"`;
      }
      return '[REDACTED]';
    });
  }
  return sanitized;
}

// ---- Custom PHI Sanitization Format ----
const phiSanitizeFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = sanitizePhi(info.message);
  }
  // Sanitize metadata/splat args
  if (info.metadata && typeof info.metadata === 'object') {
    const metaStr = JSON.stringify(info.metadata);
    info.metadata = JSON.parse(sanitizePhi(metaStr));
  }
  return info;
});

// ---- Log Format ----
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  phiSanitizeFormat(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}${stackStr}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  phiSanitizeFormat(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level}: ${message}${stackStr}`;
  })
);

// ---- Logger Instance ----
const logsDir = path.resolve(env.LOG_FILE_PATH);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: consoleFormat,
    level: env.LOG_LEVEL,
  }),
];

// File transports in non-test environments
if (env.NODE_ENV !== 'test') {
  transports.push(
    // Combined log — all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      level: env.LOG_LEVEL,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 30,
    }),
    // Error log — errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      format: logFormat,
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 90, // 90-day retention for error logs
    }),
    // Audit log — dedicated file for PHI access and security events
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      format: logFormat,
      level: 'info',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 365, // 1-year audit log retention
    })
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'radiantilyk-emr' },
  transports,
  exitOnError: false,
});

// ---- Convenience Methods ----

/**
 * Log a PHI access event for HIPAA audit trail.
 */
export function logPhiAccess(userId: string, patientId: string, action: string, resourceType: string, ip: string): void {
  logger.info(`[PHI_ACCESS] user=${userId} patient=${patientId} action=${action} resource=${resourceType} ip=${ip}`);
}

/**
 * Log a security event (brute force, rate limit, suspicious activity).
 */
export function logSecurityEvent(eventType: string, severity: string, sourceIp: string, details: string): void {
  logger.warn(`[SECURITY] type=${eventType} severity=${severity} ip=${sourceIp} details=${details}`);
}

/**
 * Log an authentication event.
 */
export function logAuthEvent(eventType: string, email: string, ip: string, success: boolean): void {
  logger.info(`[AUTH] type=${eventType} email=${email} ip=${ip} success=${success}`);
}
