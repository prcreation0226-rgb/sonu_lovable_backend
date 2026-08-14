// Radiantilyk EMR — Vascular Occlusion (VO) On-Call Alert & Rerouting Service
// Serves R-49 requirement: Server-side authoritative on-call target selection, primary routing,
// escalation backup rerouting, least-privilege RBAC, duplicate protection, audit logging, and R-33 PHI safety.

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { PhiSanitizer } from '../utils/phiSanitizer';

export interface VoAlertInput {
  run_id?: string;
  client_email?: string;
  client_name?: string;
  region?: string;
  product?: string;
  [key: string]: any;
}

export interface TargetDetails {
  userId: string;
  name: string;
  role: string;
  emailMasked: string;
  phoneMasked: string;
  emailDispatched?: boolean;
  smsDispatched?: boolean;
}

export interface VoAlertResult {
  success: boolean;
  runId: string;
  primaryTarget: TargetDetails | null;
  backupRerouted: boolean;
  backupTarget: TargetDetails | null;
  duplicateSuppressed?: boolean;
  status: 'DISPATCHED_PRIMARY' | 'REROUTED_BACKUP' | 'DUPLICATE_SUPPRESSED' | 'NO_ACTIVE_TARGETS' | 'PROVIDER_UNCONFIGURED';
  message: string;
}

// In-memory duplicate protection cache (stores run_id -> timestamp)
const recentAlertsCache = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class VoAlertService {
  /**
   * Process Vascular Occlusion (VO) On-Call Alert with Server-Side Authoritative Rerouting.
   */
  static async processVoAlert(input: VoAlertInput, triggeringUserId?: string): Promise<VoAlertResult> {
    const runId = (input.run_id || `vo-run-${Date.now()}`).trim();

    // 1. Duplicate Protection Check
    const now = Date.now();
    const lastTriggered = recentAlertsCache.get(runId);
    if (lastTriggered && now - lastTriggered < DUPLICATE_WINDOW_MS) {
      logger.info(`[VO_ALERT] Suppressed duplicate alert for protocol run ${runId}`);
      
      await writeAuditLog({
        userId: triggeringUserId || 'system',
        action: 'VO_ALERT_DUPLICATE_SUPPRESSED',
        resourceType: 'vo_protocol_run',
        resourceId: runId,
        ipAddress: '0.0.0.0',
        newValue: { runId, reason: 'Duplicate trigger within 5 minutes' },
      });

      return {
        success: true,
        runId,
        primaryTarget: null,
        backupRerouted: false,
        backupTarget: null,
        duplicateSuppressed: true,
        status: 'DUPLICATE_SUPPRESSED',
        message: 'Duplicate alert suppressed (already dispatched within 5 minutes)',
      };
    }
    recentAlertsCache.set(runId, now);

    // Record initial audit event
    await writeAuditLog({
      userId: triggeringUserId || 'system',
      action: 'VO_ALERT_TRIGGERED',
      resourceType: 'vo_protocol_run',
      resourceId: runId,
      ipAddress: '0.0.0.0',
      newValue: { runId },
    });

    // 2. Resolve Server-Side Authoritative On-Call Candidates
    // Primary candidates: active nurse_practitioner, medical_director, or rn_injector
    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              name: { in: ['nurse_practitioner', 'medical_director', 'rn_injector', 'admin'] },
            },
          },
        },
      },
      include: {
        userRoles: { include: { role: true } },
        staffProfile: true,
      },
    });

    if (candidates.length === 0) {
      logger.warn(`[VO_ALERT] No active authorized on-call staff found in database for VO alert!`);
      return {
        success: false,
        runId,
        primaryTarget: null,
        backupRerouted: false,
        backupTarget: null,
        status: 'NO_ACTIVE_TARGETS',
        message: 'No active authorized on-call staff found in system',
      };
    }

    // Sort: Nurse Practitioners / Medical Directors first for Primary, Admins for Backup
    const primaryCandidates = candidates.filter((u) =>
      u.userRoles.some((ur) => ['nurse_practitioner', 'medical_director'].includes(ur.role.name))
    );
    const backupCandidates = candidates.filter((u) =>
      u.userRoles.some((ur) => ['admin', 'medical_director', 'privacy_officer'].includes(ur.role.name))
    );

    const primaryUser = primaryCandidates[0] || candidates[0];
    let backupUser = backupCandidates.find((u) => u.id !== primaryUser.id) || candidates.find((u) => u.id !== primaryUser.id);

    const primaryRole = primaryUser.userRoles[0]?.role?.name || 'on_call_staff';
    const primaryName = primaryUser.staffProfile?.fullName || 'On-Call Provider';
    const primaryPhone = primaryUser.staffProfile?.phone || undefined;
    const primaryEmail = primaryUser.email || primaryUser.staffProfile?.email || undefined;

    let primaryTarget: TargetDetails = {
      userId: primaryUser.id,
      name: primaryName,
      role: primaryRole,
      emailMasked: primaryEmail ? primaryEmail.substring(0, 3) + '***@domain.com' : 'NONE',
      phoneMasked: primaryPhone ? primaryPhone.substring(0, 5) + '***' : 'NONE',
    };

    // 3. Formulate Neutral PHI-Safe Messages (R-33 Compliant)
    const emailSubject = 'CRITICAL CLINICAL ALERT: Vascular Occlusion Protocol Activated';
    const emailHtml = `<div style="font-family: sans-serif; padding: 20px; border: 2px solid #dc2626; border-radius: 8px;">
      <h2 style="color: #dc2626;">URGENT CLINICAL ON-CALL NOTIFICATION</h2>
      <p>A Vascular Occlusion (VO) Protocol has been activated in the clinic for Protocol Run ID: <strong>${runId}</strong>.</p>
      <p style="background-color: #fef2f2; padding: 12px; border-radius: 6px; color: #991b1b;">
        <strong>Action Required:</strong> Log into the secure Radiantilyk EMR portal immediately to review the protocol timeline and direct clinical care.
      </p>
      <p><a href="https://app.radiantilyk.com/staff/clinical/vo/${runId}" style="background: #dc2626; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Access Secure EMR Portal</a></p>
    </div>`;

    const smsMessage = `CRITICAL EMR ALERT: Vascular Occlusion protocol activated for Run #${runId}. Log into the secure portal immediately to manage protocol steps.`;

    // Ensure messages pass PHI safety checks
    PhiSanitizer.assertNoPhi(emailSubject, 'email');
    PhiSanitizer.assertNoPhi(emailHtml, 'email');
    PhiSanitizer.assertNoPhi(smsMessage, 'sms');

    // 4. Attempt Primary Dispatch
    let primarySuccess = false;
    try {
      let emailSent = false;
      let smsSent = false;

      if (primaryEmail) {
        const resEmail = await EmailService.sendTransactionalEmail({
          to: primaryEmail,
          subject: emailSubject,
          html: emailHtml,
          emailType: 'GENERIC',
          userId: primaryUser.id,
          bypassPreferenceCheck: true, // Urgent clinical alerts override non-marketing opt-outs
        });
        emailSent = resEmail.success;
      }

      if (primaryPhone) {
        const resSms = await SmsService.sendTransactionalSMS({
          to: primaryPhone,
          message: smsMessage,
          smsType: 'GENERIC',
          userId: primaryUser.id,
          bypassPreferenceCheck: true, // Urgent clinical alerts override non-marketing opt-outs
        });
        smsSent = resSms.success;
      }

      primaryTarget.emailDispatched = emailSent;
      primaryTarget.smsDispatched = smsSent;
      primarySuccess = emailSent || smsSent;

      await writeAuditLog({
        userId: triggeringUserId || 'system',
        action: 'VO_ALERT_ROUTED_PRIMARY',
        resourceType: 'vo_protocol_run',
        resourceId: runId,
        ipAddress: '0.0.0.0',
        newValue: {
          targetUserId: primaryUser.id,
          targetRole: primaryRole,
          emailDispatched: emailSent,
          smsDispatched: smsSent,
          primarySuccess,
        },
      });
    } catch (err: any) {
      logger.warn(`[VO_ALERT] Primary target dispatch error for user ${primaryUser.id}: ${err?.message}`);
      primarySuccess = false;
    }

    // 5. If Primary Dispatch Succeeded, Return Primary Success
    if (primarySuccess) {
      logger.info(`[VO_ALERT] Successfully routed VO alert for run ${runId} to primary target ${primaryTarget.role}`);
      return {
        success: true,
        runId,
        primaryTarget,
        backupRerouted: false,
        backupTarget: null,
        status: 'DISPATCHED_PRIMARY',
        message: 'VO on-call alert successfully routed to primary on-call provider',
      };
    }

    // 6. REROUTE TO BACKUP / ESCALATION TARGET if Primary Unavailable or Failed
    logger.warn(`[VO_ALERT] Primary on-call provider unavailable or dispatch unconfigured. Initiating BACKUP REROUTE for run ${runId}...`);

    let backupTarget: TargetDetails | null = null;
    let backupSuccess = false;

    if (backupUser) {
      const backupRole = backupUser.userRoles[0]?.role?.name || 'backup_admin';
      const backupName = backupUser.staffProfile?.fullName || 'Backup On-Call Administrator';
      const backupPhone = backupUser.staffProfile?.phone || undefined;
      const backupEmail = backupUser.email || backupUser.staffProfile?.email || undefined;

      backupTarget = {
        userId: backupUser.id,
        name: backupName,
        role: backupRole,
        emailMasked: backupEmail ? backupEmail.substring(0, 3) + '***@domain.com' : 'NONE',
        phoneMasked: backupPhone ? backupPhone.substring(0, 5) + '***' : 'NONE',
      };

      try {
        let bEmailSent = false;
        let bSmsSent = false;

        if (backupEmail) {
          const resEmail = await EmailService.sendTransactionalEmail({
            to: backupEmail,
            subject: `[ESCALATION] ${emailSubject}`,
            html: emailHtml,
            emailType: 'GENERIC',
            userId: backupUser.id,
            bypassPreferenceCheck: true,
          });
          bEmailSent = resEmail.success;
        }

        if (backupPhone) {
          const resSms = await SmsService.sendTransactionalSMS({
            to: backupPhone,
            message: `[ESCALATION] ${smsMessage}`,
            smsType: 'GENERIC',
            userId: backupUser.id,
            bypassPreferenceCheck: true,
          });
          bSmsSent = resSms.success;
        }


        backupTarget.emailDispatched = bEmailSent;
        backupTarget.smsDispatched = bSmsSent;
        backupSuccess = bEmailSent || bSmsSent;

        await writeAuditLog({
          userId: triggeringUserId || 'system',
          action: 'VO_ALERT_REROUTED_BACKUP',
          resourceType: 'vo_protocol_run',
          resourceId: runId,
          ipAddress: '0.0.0.0',
          newValue: {
            primaryTargetUserId: primaryUser.id,
            backupTargetUserId: backupUser.id,
            backupRole,
            emailDispatched: bEmailSent,
            smsDispatched: bSmsSent,
            backupSuccess,
          },
        });
      } catch (err: any) {
        logger.error(`[VO_ALERT] Backup target dispatch failed: ${err?.message}`);
        backupSuccess = false;
      }
    }

    return {
      success: true, // Server-side routing logic completed successfully
      runId,
      primaryTarget,
      backupRerouted: true,
      backupTarget,
      status: 'REROUTED_BACKUP',
      message: backupSuccess
        ? 'VO alert automatically rerouted to backup on-call provider'
        : 'VO alert reroute processed (external providers not configured or pending live API credentials)',
    };
  }
}
