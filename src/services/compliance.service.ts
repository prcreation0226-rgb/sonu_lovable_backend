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
  CreateStaffTrainingInput,
  CreateExternalDisclosureInput,
  QueryAuditLogInput,
} from '../schemas/compliance.schema';

export class ComplianceService {
  // ==========================================
  // ---- BREACH REPORTS ----
  // ==========================================

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

  // ==========================================
  // ---- STAFF TRAINING RECORDS ----
  // ==========================================

  static async createTrainingRecord(input: CreateStaffTrainingInput, userId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: input.staffId } });
    if (!staff) throw AppError.notFound('Staff Profile');

    const policyVersion = await prisma.policyVersion.findUnique({ where: { id: input.policyVersionId } });
    if (!policyVersion) throw AppError.notFound('Policy Version');

    // Unique constraint: staff + policyVersion (check before insert for better error message)
    const existing = await prisma.staffTrainingRecord.findUnique({
      where: {
        staffId_policyVersionId: {
          staffId: input.staffId,
          policyVersionId: input.policyVersionId,
        },
      },
    });
    if (existing) {
      throw AppError.conflict('Training record already exists for this staff member and policy version');
    }

    const record = await prisma.staffTrainingRecord.create({
      data: {
        staffId: input.staffId,
        policyVersionId: input.policyVersionId,
        trainingName: input.trainingName,
        score: input.score || undefined,
        acknowledgedAt: new Date(),
        signatureData: input.signatureData || undefined,
        ipAddress,
      },
      include: {
        staff: { select: { id: true, fullName: true } },
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });

    await writeAuditLog({
      userId,
      action: 'TRAINING_RECORD_CREATED',
      resourceType: 'training_record',
      resourceId: record.id,
      ipAddress,
      newValue: { staffId: input.staffId, trainingName: input.trainingName },
    });

    return record;
  }

  static async getStaffTrainingRecords(staffId: string) {
    return prisma.staffTrainingRecord.findMany({
      where: { staffId },
      orderBy: { acknowledgedAt: 'desc' },
      include: {
        policyVersion: { select: { id: true, title: true, versionNumber: true } },
      },
    });
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
}
