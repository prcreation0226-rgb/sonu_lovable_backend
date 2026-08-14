// Radiantilyk EMR — Compliance & Audit Service
// Business logic for BreachReports, PolicyVersions, StaffTraining, ExternalDisclosures, and AuditLog queries.
//
// HIPAA / CMIA Compliance:
// 1. Breach reports auto-calculate CMIA 15-day notification deadline
// 2. External disclosures enforce 6-year mandatory retention
// 3. PolicyVersion snapshots are immutable (isCurrent flag toggling)
// 4. Staff training records enforce unique per staff+policyVersion

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import {

  CreateBreachReportInput,
  UpdateBreachReportInput,
  CreatePolicyVersionInput,
  CreateHipaaPolicyInput,
  UpdatePolicyStatusInput,
  AcknowledgePolicyInput,

  CreateExternalDisclosureInput,
  QueryAuditLogInput,
} from '../schemas/compliance.schema';

export class ComplianceService {

  // ==========================================
  // ---- BREACH REPORTS ----
  // ==========================================
  // (unmodified)


  static async createBreachReport(input: CreateBreachReportInput, userId: string, ipAddress: string) {
    const discoveryDate = new Date(input.discoveryDate);

    // CMIA §1798.82: Notification must be made "in the most expedient time possible"
    // Practical deadline: 15 calendar days from discovery (California standard)
    const cmiaDeadline = new Date(discoveryDate);
    cmiaDeadline.setDate(cmiaDeadline.getDate() + 15);

    const report = await prisma.breachReport.create({
      data: {
        reportedBy: userId,
        breachType: input.breachType,
        description: input.description,
        patientsAffected: input.patientsAffected,
        phiInvolved: input.phiInvolved,
        discoveryDate,
        cmiaDeadline,
        remediationSteps: input.remediationSteps || undefined,
        status: 'reported',
      },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'BREACH_REPORT_CREATED',
      resourceType: 'breach_report',
      resourceId: report.id,
      ipAddress,
      newValue: { breachType: input.breachType, patientsAffected: input.patientsAffected },
    });

    return report;
  }

  static async getBreachReports() {
    return prisma.breachReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });
  }

  static async getBreachReportById(reportId: string) {
    const report = await prisma.breachReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });
    if (!report) throw AppError.notFound('Breach Report');
    return report;
  }

  static async updateBreachReport(reportId: string, input: UpdateBreachReportInput, userId: string, ipAddress: string) {
    const report = await prisma.breachReport.findUnique({ where: { id: reportId } });
    if (!report) throw AppError.notFound('Breach Report');

    const updateData: any = {};
    if (input.status) updateData.status = input.status;
    if (input.hhsNotificationDate) updateData.hhsNotificationDate = new Date(input.hhsNotificationDate);
    if (input.caAgNotificationDate) updateData.caAgNotificationDate = new Date(input.caAgNotificationDate);
    if (input.remediationSteps) updateData.remediationSteps = input.remediationSteps;
    if (input.status === 'resolved') updateData.resolvedAt = new Date();

    const updated = await prisma.breachReport.update({
      where: { id: reportId },
      data: updateData,
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'BREACH_REPORT_UPDATED',
      resourceType: 'breach_report',
      resourceId: reportId,
      ipAddress,
      newValue: { status: input.status },
    });

    return updated;
  }

  // ==========================================
  // ---- POLICY VERSIONS ----
  // ==========================================

  static async createPolicyVersion(input: CreatePolicyVersionInput, userId: string, ipAddress: string) {
    // Mark all previous versions of this policy as not current
    await prisma.policyVersion.updateMany({
      where: { policyId: input.policyId, isCurrent: true },
      data: { isCurrent: false },
    });

    const version = await prisma.policyVersion.create({
      data: {
        policyId: input.policyId,
        title: input.title,
        content: input.content,
        versionNumber: input.versionNumber,
        effectiveDate: new Date(input.effectiveDate),
        reviewDate: input.reviewDate ? new Date(input.reviewDate) : undefined,
        isCurrent: true,
        createdBy: userId,
      },
      include: {
        creator: { select: { id: true, email: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'POLICY_VERSION_CREATED',
      resourceType: 'policy_version',
      resourceId: version.id,
      ipAddress,
      newValue: { title: input.title, versionNumber: input.versionNumber },
    });

    return version;
  }

  static async getPolicies() {
    // Try HipaaPolicy table first (new governance model)
    try {
      const hipaaPolicies = await (prisma as any).hipaaPolicy.findMany({
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
        include: {
          approvals: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
      if (hipaaPolicies.length > 0) {
        return hipaaPolicies.map((p: any) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          category: p.category,
          summary: p.summary,
          body_markdown: p.bodyMarkdown,
          version: p.version,
          status: p.status,
          approval_status: p.approvalStatus,
          approved_by_name: p.approvedByName,
          approved_at: p.approvedAt,
          effective_date: p.effectiveDate,
          review_due_date: p.reviewDueDate,
          updated_at: p.updatedAt,
          cmia_discovery_date: p.cmiaDiscoveryDate,
          cmia_notification_deadline: p.cmiaNotificationDeadline,
          cmia_patient_notification_status: p.cmiaPatientNotifyStatus,
          cmia_ag_notification_status: p.cmiaAgNotifyStatus,
          approvals: p.approvals,
        }));
      }
    } catch (e) {
      // HipaaPolicy table may not exist yet — fall through to legacy
    }

    // Fallback: legacy PolicyVersion table
    return prisma.policyVersion.findMany({
      where: { deletedAt: null, isCurrent: true },
      orderBy: { effectiveDate: 'desc' },
      include: {
        creator: { select: { id: true, email: true } },
        _count: { select: { trainingRecords: true } },
      },
    });
  }

  static async createHipaaPolicy(input: CreateHipaaPolicyInput, userId: string, ipAddress: string) {
    const slug =
      input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const staff = await prisma.staffProfile.findFirst({ where: { userId }, select: { fullName: true } });
    const actorName = staff?.fullName || user?.email || 'Privacy & Security Officer';

    const result = await prisma.$transaction(async (tx) => {
      const policy = await tx.hipaaPolicy.create({
        data: {
          slug,
          title: input.title,
          category: input.category || 'Administrative Safeguards',
          summary: input.summary || null,
          bodyMarkdown: input.bodyMarkdown,
          version: 1,
          status: 'draft',
          approvalStatus: 'pending_review',
          effectiveDate: input.effectiveDate || new Date().toISOString().split('T')[0],
          reviewDueDate: input.reviewDueDate || null,
        },
      });

      await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          title: input.title,
          content: input.bodyMarkdown,
          versionNumber: 1,
          effectiveDate: new Date(policy.effectiveDate || Date.now()),
          isCurrent: true,
          createdBy: userId,
        },
      });

      await tx.policyApproval.create({
        data: {
          policyId: policy.id,
          action: 'created',
          actorName,
          actorRole: 'Privacy & Security Officer',
          status: 'submitted',
          notes: `Initial policy draft created for "${input.title}"`,
          ipAddress,
        },
      });

      return policy;
    });

    await writeAuditLog({
      userId,
      action: 'POLICY_CREATED',
      resourceType: 'hipaa_policy',
      resourceId: result.id,
      ipAddress,
      newValue: { title: input.title, category: input.category },
    });

    return result;
  }

  static async updatePolicyStatus(policyId: string, input: UpdatePolicyStatusInput, userId: string, ipAddress: string) {
    const policy = await prisma.hipaaPolicy.findUnique({ where: { id: policyId } });
    if (!policy) throw AppError.notFound('HIPAA Policy');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const staff = await prisma.staffProfile.findFirst({ where: { userId }, select: { fullName: true } });
    const actorName = staff?.fullName || user?.email || 'Privacy & Security Officer';

    const isPublishing = input.status === 'approved' || input.approvalStatus === 'approved';
    const nextVersion = isPublishing && policy.status === 'draft' ? policy.version + 1 : policy.version;

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (input.title) updateData.title = input.title;
    if (input.category) updateData.category = input.category;
    if (input.summary !== undefined) updateData.summary = input.summary;
    if (input.bodyMarkdown) updateData.bodyMarkdown = input.bodyMarkdown;
    if (input.status) updateData.status = input.status;
    if (input.approvalStatus) updateData.approvalStatus = input.approvalStatus;
    if (input.effectiveDate) updateData.effectiveDate = input.effectiveDate;
    if (input.reviewDueDate) updateData.reviewDueDate = input.reviewDueDate;

    if (isPublishing) {
      updateData.version = nextVersion;
      updateData.status = 'approved';
      updateData.approvalStatus = 'approved';
      updateData.approvedByName = actorName;
      updateData.approvedAt = new Date();
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.hipaaPolicy.update({
        where: { id: policyId },
        data: updateData,
      });

      if (isPublishing) {
        await tx.policyVersion.updateMany({
          where: { policyId, isCurrent: true },
          data: { isCurrent: false },
        });

        await tx.policyVersion.create({
          data: {
            policyId,
            title: updated.title,
            content: updated.bodyMarkdown,
            versionNumber: nextVersion,
            effectiveDate: new Date(updated.effectiveDate || Date.now()),
            isCurrent: true,
            createdBy: userId,
          },
        });
      }

      await tx.policyApproval.create({
        data: {
          policyId,
          action: input.status || 'updated',
          actorName,
          actorRole: 'Privacy & Security Officer',
          status: input.approvalStatus || input.status || 'updated',
          notes: input.notes || `Policy status updated to ${input.status || input.approvalStatus}`,
          ipAddress,
        },
      });

      return updated;
    });

    await writeAuditLog({
      userId,
      action: isPublishing ? 'POLICY_APPROVED' : 'POLICY_STATUS_CHANGED',
      resourceType: 'hipaa_policy',
      resourceId: policyId,
      ipAddress,
      newValue: { status: input.status, version: result.version },
    });

    return result;
  }

  static async getPolicyVersions(policyId: string) {
    return prisma.policyVersion.findMany({
      where: { policyId, deletedAt: null },
      orderBy: { versionNumber: 'desc' },
      include: {
        creator: { select: { id: true, email: true } },
      },
    });
  }

  static async getPolicyApprovals(policyId: string) {
    return prisma.policyApproval.findMany({
      where: { policyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async acknowledgePolicy(policyId: string, input: AcknowledgePolicyInput, userId: string, ipAddress: string) {
    const policy = await prisma.hipaaPolicy.findUnique({ where: { id: policyId } });
    if (!policy) throw AppError.notFound('HIPAA Policy');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    const actorName = staffProfile?.fullName || user?.email || input.signatureText;

    const result = await prisma.$transaction(async (tx) => {
      const approval = await tx.policyApproval.create({
        data: {
          policyId,
          action: 'acknowledged',
          actorName,
          actorRole: 'Staff Member',
          status: 'acknowledged',
          notes: `Signed electronically by ${input.signatureText}`,
          ipAddress,
        },
      });

      if (staffProfile && input.policyVersionId) {
        const existingTraining = await tx.staffTrainingRecord.findFirst({
          where: {
            staffId: staffProfile.id,
            policyVersionId: input.policyVersionId,
          },
        });

        if (existingTraining) {
          await tx.staffTrainingRecord.update({
            where: { id: existingTraining.id },
            data: {
              acknowledgedAt: new Date(),
              signatureData: input.signatureText,
              ipAddress,
            },
          });
        } else {
          await tx.staffTrainingRecord.create({
            data: {
              staffId: staffProfile.id,
              policyVersionId: input.policyVersionId,
              trainingName: policy.title,
              trainingType: 'policy_acknowledgment',
              status: 'completed',
              completedAt: new Date(),
              acknowledgedAt: new Date(),
              signatureData: input.signatureText,
              ipAddress,
            },
          });
        }
      }


      return approval;
    });

    await writeAuditLog({
      userId,
      action: 'POLICY_ACKNOWLEDGED',
      resourceType: 'hipaa_policy',
      resourceId: policyId,
      ipAddress,
      newValue: { signedBy: actorName, version: policy.version },
    });

    return result;
  }

  static async getPolicyAcknowledgements(policyId: string) {
    return prisma.policyApproval.findMany({
      where: { policyId, action: 'acknowledged' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // ---- STAFF TRAINING RECORDS ----
  // ==========================================

  static async createTrainingRecord(input: any, userId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: input.staffId } });
    if (!staff) throw AppError.notFound('Staff Profile');

    if (input.policyVersionId) {
      const policyVersion = await prisma.policyVersion.findUnique({ where: { id: input.policyVersionId } });
      if (!policyVersion) throw AppError.notFound('Policy Version');
    }

    const isAnnual = input.isAnnual !== false;
    // Calculate default 1-year annual expiration date if not specified
    const defaultExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const record = await prisma.staffTrainingRecord.create({
      data: {
        staffId: input.staffId,
        policyVersionId: input.policyVersionId || null,
        trainingName: input.trainingName || 'Annual HIPAA Privacy & Security Training',
        trainingType: input.trainingType || (isAnnual ? 'annual_hipaa' : 'general_compliance'),
        status: input.completed ? 'completed' : 'assigned',
        isAnnual,
        score: input.score || null,
        assignedAt: new Date(),
        completedAt: input.completed ? new Date() : null,
        acknowledgedAt: input.completed ? new Date() : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : defaultExpiry,
        certificateUrl: input.certificateUrl || null,
        signatureData: input.signatureData || null,
        ipAddress,
      },
      include: {
        staff: { select: { id: true, fullName: true, user: { select: { email: true } } } },
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'TRAINING_RECORD_CREATED',
      resourceType: 'training_record',
      resourceId: record.id,
      ipAddress,
      newValue: { staffId: input.staffId, trainingName: record.trainingName, status: record.status },
    });

    return record;
  }

  static async getStaffTrainingRecords(staffId: string) {
    const records = await prisma.staffTrainingRecord.findMany({
      where: { staffId },
      orderBy: { assignedAt: 'desc' },
      include: {
        staff: { select: { id: true, fullName: true } },
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });

    // Auto-update status to overdue if past expiration or uncompleted > 30 days
    const now = new Date();
    return records.map((r) => {
      let status = r.status;
      if (status === 'assigned' && r.assignedAt && (now.getTime() - r.assignedAt.getTime() > 30 * 24 * 60 * 60 * 1000)) {
        status = 'overdue';
      }
      if (r.expiresAt && r.expiresAt < now) {
        status = 'expired';
      }
      return { ...r, status };
    });
  }

  static async getAllTrainingRecords(filters?: { status?: string; staffId?: string; isAnnual?: boolean }) {
    const where: any = {};
    if (filters?.staffId) where.staffId = filters.staffId;
    if (filters?.isAnnual !== undefined) where.isAnnual = filters.isAnnual;
    if (filters?.status) where.status = filters.status;

    const records = await prisma.staffTrainingRecord.findMany({
      where,
      orderBy: { assignedAt: 'desc' },
      include: {
        staff: { select: { id: true, fullName: true, user: { select: { email: true } } } },
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });

    const now = new Date();
    return records.map((r) => {
      let status = r.status;
      if (status === 'assigned' && r.assignedAt && (now.getTime() - r.assignedAt.getTime() > 30 * 24 * 60 * 60 * 1000)) {
        status = 'overdue';
      }
      if (r.expiresAt && r.expiresAt < now) {
        status = 'expired';
      }
      return { ...r, status };
    });
  }

  static async completeTrainingRecord(id: string, input: { score?: number; certificateUrl?: string; signatureData?: string }, userId: string, ipAddress: string) {
    const existing = await prisma.staffTrainingRecord.findUnique({
      where: { id },
      include: { staff: { select: { id: true, userId: true, fullName: true } } },
    });
    if (!existing) throw AppError.notFound('Staff Training Record');

    // Strict Ownership & RBAC check: Only staff member themselves OR compliance admin can complete
    const callerRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const isAdminOrPrivacy = callerRoles.some(r => ['admin', 'privacy_officer'].includes(r.role.name));

    if (!isAdminOrPrivacy && existing.staff.userId !== userId) {
      throw AppError.forbidden('You can only acknowledge HIPAA training for your own staff profile');
    }

    const completedAt = new Date();
    const defaultRenewalDate = new Date(completedAt.getTime() + 365 * 24 * 60 * 60 * 1000);

    const updated = await prisma.staffTrainingRecord.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt,
        acknowledgedAt: completedAt,
        expiresAt: defaultRenewalDate,
        score: input.score ?? existing.score ?? 100,
        certificateUrl: input.certificateUrl || existing.certificateUrl,
        signatureData: input.signatureData || existing.signatureData,
        ipAddress,
      },
      include: {
        staff: { select: { id: true, fullName: true } },
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'TRAINING_RECORD_COMPLETED',
      resourceType: 'training_record',
      resourceId: updated.id,
      ipAddress,
      newValue: { staffId: updated.staffId, trainingName: updated.trainingName, completedAt, expiresAt: defaultRenewalDate },
    });

    return updated;
  }

  /**
   * Annual Staff HIPAA Acknowledgment (R-43).
   * Authenticated staff signs/acknowledges their required annual HIPAA training.
   * Idempotent per staff member + annual version/year. Preserves old historical records.
   */
  static async acknowledgeAnnualHipaa(userId: string, input: { trainingName?: string; yearVersion?: string; signatureData?: string }, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) {
      throw AppError.forbidden('No staff profile linked to this user account');
    }

    const yearVersion = (input.yearVersion || '2026-v1').trim();
    const trainingName = (input.trainingName || `Annual HIPAA Privacy & Security Training (${yearVersion})`).trim();

    // Check for existing completion of this specific annual version for this staff member (Duplicate Same-Version Prevention)
    const existingSameVersion = await prisma.staffTrainingRecord.findFirst({
      where: {
        staffId: staffProfile.id,
        trainingType: 'annual_hipaa',
        trainingName,
        status: 'completed',
      },
    });

    if (existingSameVersion) {
      return {
        ...existingSameVersion,
        alreadyAcknowledged: true,
      };
    }

    const now = new Date();
    const renewalExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const record = await prisma.staffTrainingRecord.create({
      data: {
        staffId: staffProfile.id,
        trainingName,
        trainingType: 'annual_hipaa',
        status: 'completed',
        isAnnual: true,
        score: 100,
        assignedAt: now,
        completedAt: now,
        acknowledgedAt: now,
        expiresAt: renewalExpiry,
        signatureData: input.signatureData || `Signed electronically by ${staffProfile.fullName}`,
        ipAddress,
      },
      include: {
        staff: { select: { id: true, fullName: true, title: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'HIPAA_ANNUAL_ACKNOWLEDGED',
      resourceType: 'training_record',
      resourceId: record.id,
      ipAddress,
      newValue: { staffId: staffProfile.id, trainingName, yearVersion, completedAt: now, expiresAt: renewalExpiry },
    });

    return {
      ...record,
      alreadyAcknowledged: false,
    };
  }

  /**
   * Workforce-Wide Annual HIPAA Acknowledgment Dashboard (Admin / Privacy Officer).
   * Reports completed, assigned, overdue, and expired annual HIPAA acknowledgments across workforce.
   */
  static async getAnnualHipaaDashboard() {
    const staffMembers = await prisma.staffProfile.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        fullName: true,
        title: true,
        email: true,
        user: { select: { email: true } },
        trainingRecords: {
          where: { isAnnual: true },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    const now = new Date();
    const staffCompliance = staffMembers.map((s) => {
      const annualRecords = s.trainingRecords;
      const latest = annualRecords[0];

      let complianceStatus: 'completed' | 'assigned' | 'overdue' | 'expired' = 'overdue';
      if (latest) {
        if (latest.status === 'completed' && latest.expiresAt && latest.expiresAt > now) {
          complianceStatus = 'completed';
        } else if (latest.expiresAt && latest.expiresAt < now) {
          complianceStatus = 'expired';
        } else if (latest.status === 'assigned' && latest.assignedAt && (now.getTime() - latest.assignedAt.getTime() > 30 * 24 * 60 * 60 * 1000)) {
          complianceStatus = 'overdue';
        } else if (latest.status === 'assigned') {
          complianceStatus = 'assigned';
        }
      }

      return {
        staffId: s.id,
        fullName: s.fullName,
        title: s.title,
        email: s.email || s.user?.email || null,
        complianceStatus,
        latestRecord: latest || null,
        totalHistoricalCount: annualRecords.length,
      };
    });

    const counts = {
      totalStaff: staffMembers.length,
      completed: staffCompliance.filter(c => c.complianceStatus === 'completed').length,
      assigned: staffCompliance.filter(c => c.complianceStatus === 'assigned').length,
      overdue: staffCompliance.filter(c => c.complianceStatus === 'overdue' || c.complianceStatus === 'expired').length,
    };

    return {
      summary: counts,
      workforce: staffCompliance,
    };
  }



  // ==========================================
  // ---- EXTERNAL DISCLOSURES ----
  // ==========================================

  static async createExternalDisclosure(input: CreateExternalDisclosureInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    // 6-year mandatory retention (HIPAA §164.530(j))
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 6);

    const disclosure = await prisma.externalDisclosure.create({
      data: {
        patientId: input.patientId,
        disclosedTo: input.disclosedTo,
        purpose: input.purpose,
        descriptionOfPhi: input.descriptionOfPhi,
        disclosedBy: staffProfile.id,
        retentionUntil,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        discloser: { select: { id: true, fullName: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'EXTERNAL_DISCLOSURE_CREATED',
      resourceType: 'external_disclosure',
      resourceId: disclosure.id,
      ipAddress,
      newValue: { disclosedTo: input.disclosedTo, purpose: input.purpose },
    });

    return disclosure;
  }

  static async getPatientDisclosures(patientId: string) {
    return prisma.externalDisclosure.findMany({
      where: { patientId },
      orderBy: { disclosedAt: 'desc' },
      include: {
        discloser: { select: { id: true, fullName: true } },
      },
    });
  }

  // ==========================================
  // ---- AUDIT LOG QUERIES ----
  // ==========================================

  static async queryAuditLogs(input: Partial<QueryAuditLogInput> = {}) {
    const page = Math.max(1, parseInt(String(input.page || 1), 10) || 1);
    const perPage = Math.max(1, Math.min(1000, parseInt(String(input.perPage || 100), 10) || 100));

    const where: any = {};
    if (input.userId) where.userId = input.userId;
    if (input.patientId) where.patientId = input.patientId;
    if (input.action) where.action = input.action;
    if (input.resourceType) where.resourceType = input.resourceType;
    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) where.createdAt.gte = new Date(input.startDate);
      if (input.endDate) {
        const endDate = new Date(input.endDate);
        endDate.setDate(endDate.getDate() + 1); // Include the end date
        where.createdAt.lt = endDate;
      }
    }

    const skip = (page - 1) * perPage;

    try {
      const [logs, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: perPage,
          include: {
            user: { select: { id: true, email: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return {
        logs,
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      };
    } catch {
      const [logs, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: perPage,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return {
        logs,
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      };
    }
  }

  static async queryPhiAccessLogs(input: Partial<QueryAuditLogInput> = {}) {
    const page = Math.max(1, parseInt(String(input.page || 1), 10) || 1);
    const perPage = Math.max(1, Math.min(1000, parseInt(String(input.perPage || 100), 10) || 100));

    const where: any = {};
    if (input.userId) where.userId = input.userId;
    if (input.patientId) where.patientId = input.patientId;
    if (input.action) where.action = input.action;
    if (input.resourceType) where.resourceType = input.resourceType;
    if (input.startDate || input.endDate) {
      where.createdAt = {};
      if (input.startDate) where.createdAt.gte = new Date(input.startDate);
      if (input.endDate) {
        const endDate = new Date(input.endDate);
        endDate.setDate(endDate.getDate() + 1);
        where.createdAt.lt = endDate;
      }
    }

    const skip = (page - 1) * perPage;

    try {
      const [logs, total] = await prisma.$transaction([
        prisma.phiAccessLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: perPage,
          include: {
            user: { select: { id: true, email: true } },
          },
        }),
        prisma.phiAccessLog.count({ where }),
      ]);

      return {
        logs,
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      };
    } catch {
      const [logs, total] = await prisma.$transaction([
        prisma.phiAccessLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: perPage,
        }),
        prisma.phiAccessLog.count({ where }),
      ]);

      return {
        logs,
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      };
    }
  }

  /**
   * Get Consent-Filtered Marketing Recipients (Authoritative Gate for R-41/R-47/R-48).
   * Strictly filters for: allowMarketing === true AND marketingConsentAt !== null AND deletedAt === null.
   */
  static async getMarketingRecipients() {
    const patients = await prisma.patientProfile.findMany({
      where: {
        deletedAt: null,
        marketingConsentAt: { not: null },
        communicationPref: {
          allowMarketing: true,
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        marketingConsentAt: true,
        communicationPref: {
          select: {
            allowMarketing: true,
            allowEmail: true,
            allowSms: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return patients.map((p) => ({
      id: p.id,
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      marketingConsentAt: p.marketingConsentAt,
      communicationPref: p.communicationPref,
    }));
  }
}


