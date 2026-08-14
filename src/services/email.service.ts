// Radiantilyk EMR — Centralized Transactional Email Service (Resend Integration)
// Supports account/welcome email, password reset, appointment confirmations, and generic templates.
//
// Security & Compliance:
// 1. API Key Backend Only: Key is loaded strictly from process.env / env config. Never exposed to frontend.
// 2. Controlled Error Handling: If RESEND_API_KEY is missing or API fails, returns controlled error.
//    App NEVER crashes, and NO fake mock success is returned.
// 3. No PHI in Logs: Recipient emails are masked in logs (e.g. p***t@domain.com). Email bodies containing PHI are NEVER logged.
// 4. BAA Alignment: Resend is listed as a BAA-signed email provider for Radiantilyk EMR.

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { prisma } from '../config/database';
import { PhiSanitizer } from '../utils/phiSanitizer';

export type EmailType = 'WELCOME' | 'PASSWORD_RESET' | 'APPOINTMENT_CONFIRMATION' | 'GENERIC';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  emailType: EmailType;
  patientId?: string;
  userId?: string;
  bypassPreferenceCheck?: boolean;
}

export interface EmailResult {
  success: boolean;
  providerConfigured: boolean;
  suppressed?: boolean;
  messageId?: string;
  message: string;
  recipient: string;
  error?: string;
}

/**
 * Mask email for HIPAA-compliant safe logging (e.g. j***n@domain.com).
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.trim().split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export class EmailService {
  /**
   * Check if Resend API Key is configured in backend environment.
   */
  static isConfigured(): boolean {
    const key = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();
    return key.length > 0;
  }

  /**
   * Get public status of Email Provider.
   */
  static getStatus(): { providerConfigured: boolean; provider: string; from: string } {
    return {
      providerConfigured: this.isConfigured(),
      provider: env.EMAIL_PROVIDER || 'resend',
      from: env.EMAIL_FROM || 'noreply@bookrka.com',
    };
  }

  /**
   * Send a transactional email using Resend HTTP REST API.
   */
  static async sendTransactionalEmail(options: SendEmailOptions): Promise<EmailResult> {
    const { to, subject, html, text, emailType, patientId, userId, bypassPreferenceCheck } = options;
    const cleanEmail = (to || '').trim().toLowerCase();
    const masked = maskEmail(cleanEmail);

    // 1. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      logger.warn(`[EMAIL_SERVICE] Invalid recipient email address provided: ${masked}`);
      throw AppError.badRequest('Invalid recipient email address');
    }

    // 2. Enforce PHI Safety Guardrail
    PhiSanitizer.assertNoPhi(subject, 'email');
    PhiSanitizer.assertNoPhi(text || html, 'email');

    // 3. Check Communication Preferences if patientId is provided
    if (patientId && !bypassPreferenceCheck) {
      try {
        const pref = await prisma.communicationPreference.findUnique({
          where: { patientId },
        });

        if (pref && pref.allowEmail === false) {
          logger.warn(`[EMAIL_SERVICE] Transactional email suppressed for patient #${patientId}: allowEmail is false. type=${emailType} recipient=${masked}`);

          await writeAuditLog({
            userId: userId || 'system',
            patientId,
            action: 'EMAIL_SUPPRESSED',
            resourceType: 'email',
            resourceId: `type:${emailType}`,
            ipAddress: '0.0.0.0',
            newValue: {
              emailType,
              status: 'SUPPRESSED_PREFERENCE',
              recipientMasked: masked,
              reason: 'allowEmail preference is false',
            },
          });

          return {
            success: false,
            providerConfigured: this.isConfigured(),
            suppressed: true,
            message: 'Email suppressed: Patient has disabled email notifications (allowEmail = false)',
            recipient: masked,
          };
        }
      } catch (err) {
        logger.warn(`[EMAIL_SERVICE] Could not verify communication preferences for patient #${patientId}`);
      }
    }

    // 4. Check if provider is configured
    if (!this.isConfigured()) {
      logger.warn(`[EMAIL_SERVICE] Email provider not configured (RESEND_API_KEY missing). type=${emailType} recipient=${masked}`);
      
      await writeAuditLog({
        userId: userId || 'system',
        patientId,
        action: 'EMAIL_SEND_ATTEMPTED',
        resourceType: 'email',
        resourceId: `type:${emailType}`,
        ipAddress: '0.0.0.0',
        newValue: {
          emailType,
          status: 'NOT_CONFIGURED',
          recipientMasked: masked,
        },
      });

      return {
        success: false,
        providerConfigured: false,
        message: 'Email provider is not configured on server (RESEND_API_KEY is missing)',
        recipient: masked,
      };
    }

    const apiKey = (env.RESEND_API_KEY || process.env.RESEND_API_KEY || '').trim();

    const fromAddress = env.EMAIL_FROM || 'Radiantilyk EMR <noreply@bookrka.com>';

    // 3. Dispatch HTTP request to Resend API
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [cleanEmail],
          subject,
          html,
          text: text || html.replace(/<[^>]*>?/gm, ''),
        }),
      });

      const responseData: any = await response.json().catch(() => ({}));

      if (response.ok && responseData?.id) {
        logger.info(`[EMAIL_SERVICE] Successfully dispatched ${emailType} email to ${masked}. Message ID: ${responseData.id}`);

        await writeAuditLog({
          userId: userId || 'system',
          patientId,
          action: 'EMAIL_SENT',
          resourceType: 'email',
          resourceId: responseData.id || `type:${emailType}`,
          ipAddress: '0.0.0.0',
          newValue: {
            emailType,
            status: 'SENT',
            recipientMasked: masked,
            messageId: responseData.id,
          },
        });

        return {
          success: true,
          providerConfigured: true,
          messageId: responseData.id,
          message: `${emailType} email sent successfully`,
          recipient: masked,
        };
      } else {
        const errorMsg = responseData?.message || responseData?.error || `HTTP ${response.status} ${response.statusText}`;
        logger.error(`[EMAIL_SERVICE] Failed to send ${emailType} email to ${masked}. Resend API Error: ${errorMsg}`);

        await writeAuditLog({
          userId: userId || 'system',
          patientId,
          action: 'EMAIL_FAILED',
          resourceType: 'email',
          resourceId: `type:${emailType}`,
          ipAddress: '0.0.0.0',
          newValue: {
            emailType,
            status: 'FAILED',
            recipientMasked: masked,
            error: errorMsg,
          },
        });


        return {
          success: false,
          providerConfigured: true,
          message: `Failed to send email via Resend: ${errorMsg}`,
          recipient: masked,
          error: errorMsg,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network or connection failure';
      logger.error(`[EMAIL_SERVICE] Network failure while calling Resend API for ${emailType} to ${masked}: ${errMsg}`);

      return {
        success: false,
        providerConfigured: true,
        message: `Email dispatch network error: ${errMsg}`,
        recipient: masked,
        error: errMsg,
      };
    }
  }

  /**
   * Reusable Template: Account / Welcome Email
   */
  static async sendWelcomeEmail(params: {
    to: string;
    name: string;
    userId?: string;
    patientId?: string;
  }): Promise<EmailResult> {
    const { to, name, userId, patientId } = params;
    const cleanName = (name || 'Valued Patient').trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Welcome to Radiantilyk EMR</h2>
        <p>Dear ${cleanName},</p>
        <p>Your account has been successfully created. You can now access your patient portal to view appointments, medical records, and digital consents.</p>
        <div style="margin: 24px 0;">
          <a href="${env.CORS_ORIGIN}/login" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Access Patient Portal</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          This is an automated transactional notification from Radiantilyk EMR. Please do not reply directly to this email.
        </p>
      </div>
    `;

    return this.sendTransactionalEmail({
      to,
      subject: 'Welcome to Radiantilyk EMR Patient Portal',
      html,
      emailType: 'WELCOME',
      userId,
      patientId,
    });
  }

  /**
   * Reusable Template: Password Reset Email
   */
  static async sendPasswordResetEmail(params: {
    to: string;
    resetUrl: string;
    userId?: string;
  }): Promise<EmailResult> {
    const { to, resetUrl, userId } = params;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Password Reset Request</h2>
        <p>We received a request to reset the password for your Radiantilyk EMR account.</p>
        <p>Click the secure button below to set a new password. This link is valid for 30 minutes.</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">If you did not request this password reset, please ignore this email or contact support immediately.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          Radiantilyk EMR Security Notification
        </p>
      </div>
    `;

    return this.sendTransactionalEmail({
      to,
      subject: 'Radiantilyk EMR — Password Reset Instructions',
      html,
      emailType: 'PASSWORD_RESET',
      userId,
    });
  }

  /**
   * Reusable Template: Appointment / Booking Confirmation Email
   */
  static async sendAppointmentConfirmationEmail(params: {
    to: string;
    patientName: string;
    appointmentDate: string;
    serviceName: string;
    patientId?: string;
  }): Promise<EmailResult> {
    const { to, patientName, appointmentDate, serviceName, patientId } = params;
    const cleanName = (patientName || 'Valued Patient').trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 16px;">Appointment Confirmation</h2>
        <p>Dear ${cleanName},</p>
        <p>Your appointment has been confirmed:</p>
        <ul style="line-height: 1.6; color: #374151;">
          <li><strong>Service:</strong> ${serviceName}</li>
          <li><strong>Date & Time:</strong> ${appointmentDate}</li>
        </ul>
        <div style="margin: 24px 0;">
          <a href="${env.CORS_ORIGIN}/patient/account" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Appointment Details</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          Radiantilyk EMR Appointment System
        </p>
      </div>
    `;

    return this.sendTransactionalEmail({
      to,
      subject: `Appointment Confirmed: ${serviceName}`,
      html,
      emailType: 'APPOINTMENT_CONFIRMATION',
      patientId,
    });
  }
}
