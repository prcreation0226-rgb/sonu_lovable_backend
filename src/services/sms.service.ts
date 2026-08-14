// Radiantilyk EMR — Centralized Transactional SMS Service (Twilio Integration)
// Supports appointment confirmation, appointment reminder, cancellation notifications, and generic templates.
//
// Healthcare & Security Guardrails:
// 1. Backend-Only Credentials: Twilio SID/AuthToken loaded strictly from backend environment. Never exposed to frontend.
// 2. Communication Preference Enforcement: Checks CommunicationPreference.allowSms. If false, SMS is suppressed.
//    (Note: allowMarketing does NOT restrict transactional appointment reminders).
// 3. Masked Phone Logging: Recipient phone numbers are masked in logs (e.g. +1555***4567). Full SMS text containing PHI is NEVER logged.
// 4. Controlled Provider Error Handling: If credentials are missing, returns controlled failure ({ success: false, providerConfigured: false }).
//    App NEVER crashes, and NO fake mock success is returned.

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { prisma } from '../config/database';
import { PhiSanitizer } from '../utils/phiSanitizer';

export type SmsType = 'APPOINTMENT_CONFIRMATION' | 'APPOINTMENT_REMINDER' | 'APPOINTMENT_CANCELLATION' | 'GENERIC';


export interface SendSmsOptions {
  to: string;
  message: string;
  smsType: SmsType;
  patientId?: string;
  userId?: string;
  bypassPreferenceCheck?: boolean;
}

export interface SmsResult {
  success: boolean;
  providerConfigured: boolean;
  suppressed?: boolean;
  messageId?: string;
  message: string;
  recipient: string;
  error?: string;
}

/**
 * Mask phone number for HIPAA-compliant safe logging (e.g. +1555***4567).
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone) return '***-***-****';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length < 7) return '***-****';
  const start = clean.substring(0, 5);
  const end = clean.substring(clean.length - 4);
  return `${start}***${end}`;
}

export class SmsService {
  /**
   * Check if Twilio credentials are fully configured in backend environment.
   */
  static isConfigured(): boolean {
    const sid = (env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '').trim();
    const token = (env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '').trim();
    const phone = (env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').trim();
    return sid.length > 0 && token.length > 0 && phone.length > 0;
  }

  /**
   * Get public status of SMS Provider.
   */
  static getStatus(): { providerConfigured: boolean; provider: string; fromNumber: string } {
    return {
      providerConfigured: this.isConfigured(),
      provider: 'twilio',
      fromNumber: env.TWILIO_PHONE_NUMBER ? maskPhoneNumber(env.TWILIO_PHONE_NUMBER) : 'NOT_SET',
    };
  }

  /**
   * Dispatch transactional SMS using Twilio Programmable SMS REST API.
   */
  static async sendTransactionalSMS(options: SendSmsOptions): Promise<SmsResult> {
    const { to, message, smsType, patientId, userId, bypassPreferenceCheck } = options;
    const cleanPhone = (to || '').trim();
    const masked = maskPhoneNumber(cleanPhone);

    // 1. Validate phone number format (must contain at least 10 digits)
    const digitsOnly = cleanPhone.replace(/\D/g, '');
    if (!cleanPhone || digitsOnly.length < 10 || digitsOnly.length > 15) {
      logger.warn(`[SMS_SERVICE] Invalid recipient phone number provided: ${masked}`);
      throw AppError.badRequest('Invalid recipient phone number format');
    }

    // 2. Enforce PHI Safety Guardrail
    PhiSanitizer.assertNoPhi(message, 'sms');

    // 3. Check Communication Preferences if patientId is provided

    if (patientId && !bypassPreferenceCheck) {
      try {
        const pref = await prisma.communicationPreference.findUnique({
          where: { patientId },
        });

        if (pref && pref.allowSms === false) {
          logger.warn(`[SMS_SERVICE] Transactional SMS suppressed for patient #${patientId}: allowSms is false. type=${smsType} recipient=${masked}`);

          await writeAuditLog({
            userId: userId || 'system',
            patientId,
            action: 'SMS_SUPPRESSED',
            resourceType: 'sms',
            resourceId: `type:${smsType}`,
            ipAddress: '0.0.0.0',
            newValue: {
              smsType,
              status: 'SUPPRESSED_PREFERENCE',
              recipientMasked: masked,
              reason: 'allowSms preference is false',
            },
          });

          return {
            success: false,
            providerConfigured: this.isConfigured(),
            suppressed: true,
            message: 'SMS suppressed: Patient has disabled SMS notifications (allowSms = false)',
            recipient: masked,
          };
        }
      } catch (err) {
        logger.warn(`[SMS_SERVICE] Could not verify communication preferences for patient #${patientId}`);
      }
    }

    // 3. Check if provider is configured
    if (!this.isConfigured()) {
      logger.warn(`[SMS_SERVICE] SMS provider not configured (Twilio credentials missing). type=${smsType} recipient=${masked}`);

      await writeAuditLog({
        userId: userId || 'system',
        patientId,
        action: 'SMS_SEND_ATTEMPTED',
        resourceType: 'sms',
        resourceId: `type:${smsType}`,
        ipAddress: '0.0.0.0',
        newValue: {
          smsType,
          status: 'NOT_CONFIGURED',
          recipientMasked: masked,
        },
      });

      return {
        success: false,
        providerConfigured: false,
        message: 'SMS provider is not configured on server (Twilio credentials missing)',
        recipient: masked,
      };
    }

    const accountSid = (env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = (env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '').trim();
    const fromPhone = (env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '').trim();

    // 4. Dispatch HTTP POST request to Twilio API
    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const params = new URLSearchParams();
      params.append('From', fromPhone);
      params.append('To', cleanPhone);
      params.append('Body', message);

      const response = await fetch(twilioEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const responseData: any = await response.json().catch(() => ({}));

      if (response.ok && responseData?.sid) {
        logger.info(`[SMS_SERVICE] Successfully dispatched ${smsType} SMS to ${masked}. Message SID: ${responseData.sid}`);

        await writeAuditLog({
          userId: userId || 'system',
          patientId,
          action: 'SMS_SENT',
          resourceType: 'sms',
          resourceId: responseData.sid,
          ipAddress: '0.0.0.0',
          newValue: {
            smsType,
            status: 'SENT',
            recipientMasked: masked,
            messageSid: responseData.sid,
          },
        });

        return {
          success: true,
          providerConfigured: true,
          messageId: responseData.sid,
          message: `${smsType} SMS sent successfully`,
          recipient: masked,
        };
      } else {
        const errorMsg = responseData?.message || responseData?.error_message || `HTTP ${response.status} ${response.statusText}`;
        logger.error(`[SMS_SERVICE] Failed to send ${smsType} SMS to ${masked}. Twilio Error: ${errorMsg}`);

        await writeAuditLog({
          userId: userId || 'system',
          patientId,
          action: 'SMS_FAILED',
          resourceType: 'sms',
          resourceId: `type:${smsType}`,
          ipAddress: '0.0.0.0',
          newValue: {
            smsType,
            status: 'FAILED',
            recipientMasked: masked,
            error: errorMsg,
          },
        });

        return {
          success: false,
          providerConfigured: true,
          message: `Failed to send SMS via Twilio: ${errorMsg}`,
          recipient: masked,
          error: errorMsg,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network or connection failure';
      logger.error(`[SMS_SERVICE] Network error calling Twilio API for ${smsType} to ${masked}: ${errMsg}`);

      return {
        success: false,
        providerConfigured: true,
        message: `SMS dispatch network error: ${errMsg}`,
        recipient: masked,
        error: errMsg,
      };
    }
  }

  /**
   * Reusable Template: Appointment Confirmation SMS
   */
  static async sendAppointmentConfirmationSMS(params: {
    to: string;
    patientName: string;
    appointmentDate: string;
    serviceName: string;
    patientId?: string;
    userId?: string;
  }): Promise<SmsResult> {
    const { to, patientName, appointmentDate, serviceName, patientId, userId } = params;
    const cleanName = (patientName || 'Valued Patient').trim();
    const msg = `Radiantilyk EMR: Hi ${cleanName}, your appointment for ${serviceName} on ${appointmentDate} is confirmed. Reply HELP for assistance.`;

    return this.sendTransactionalSMS({
      to,
      message: msg,
      smsType: 'APPOINTMENT_CONFIRMATION',
      patientId,
      userId,
    });
  }

  /**
   * Reusable Template: Appointment Reminder SMS
   */
  static async sendAppointmentReminderSMS(params: {
    to: string;
    patientName: string;
    appointmentDate: string;
    serviceName: string;
    patientId?: string;
    userId?: string;
  }): Promise<SmsResult> {
    const { to, patientName, appointmentDate, serviceName, patientId, userId } = params;
    const cleanName = (patientName || 'Valued Patient').trim();
    const msg = `Radiantilyk EMR Reminder: Hi ${cleanName}, upcoming appointment for ${serviceName} on ${appointmentDate}. See you soon!`;

    return this.sendTransactionalSMS({
      to,
      message: msg,
      smsType: 'APPOINTMENT_REMINDER',
      patientId,
      userId,
    });
  }

  /**
   * Reusable Template: Appointment Cancellation / Reschedule SMS
   */
  static async sendAppointmentCancellationSMS(params: {
    to: string;
    patientName: string;
    appointmentDate: string;
    serviceName: string;
    patientId?: string;
    userId?: string;
  }): Promise<SmsResult> {
    const { to, patientName, appointmentDate, serviceName, patientId, userId } = params;
    const cleanName = (patientName || 'Valued Patient').trim();
    const msg = `Radiantilyk EMR Notice: Hi ${cleanName}, your appointment for ${serviceName} on ${appointmentDate} has been cancelled/rescheduled. Contact us if you need help.`;

    return this.sendTransactionalSMS({
      to,
      message: msg,
      smsType: 'APPOINTMENT_CANCELLATION',
      patientId,
      userId,
    });
  }
}
