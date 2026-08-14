// Radiantilyk EMR — Security Incident Response & CMIA Assessment Service
// Supports R-24 requirement: Incident creation, investigation, containment, CMIA/HIPAA breach determination,
// R-45 linkage/escalation, least-privilege RBAC, and audit trail logging.

import crypto from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { writeAuditLog } from '../middleware/audit';

export interface CreateIncidentInput {
  title: string;
  incidentType: string; // unauthorized_access, phishing, malware, lost_device, system_misconfig, improper_disclosure, other
  severity: string; // low, medium, high, critical
  discoveredAt: string | Date;
  description: string;
  affectedSystems?: string;
  assignedUserId?: string;
}

export interface UpdateIncidentInput {
  status?: string; // open, investigating, contained, resolved, closed
  assignedUserId?: string;
  containmentActions?: string;
  investigationNotes?: string;
  resolution?: string;
}

export interface AssessBreachInput {
  isPhiInvolved: boolean;
  breachDetermined: boolean;
  assessmentRationale: string;
  escalateToBreachReport?: boolean;
  patientsAffected?: number;
}

export class SecurityIncidentService {
  /**
   * Create a new Security Incident.
   */
  static async createIncident(input: CreateIncidentInput, reportingUserId: string): Promise<any> {
    const cleanTitle = (input.title || '').trim();
    if (!cleanTitle) throw AppError.badRequest('Incident title is required');

    // Generate unique incident number: INC-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    const incidentNumber = `INC-${dateStr}-${randHex}`;

    const incident = await prisma.securityIncident.create({
      data: {
        incidentNumber,
        title: cleanTitle,
        incidentType: input.incidentType || 'other',
        severity: input.severity || 'medium',
        status: 'open',
        discoveredAt: new Date(input.discoveredAt || Date.now()),
        description: input.description || '',
        affectedSystems: input.affectedSystems || null,
        reportedBy: reportingUserId,
        assignedUserId: input.assignedUserId || null,
      },
      include: {
        reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
      },
    });

    await writeAuditLog({
      userId: reportingUserId,
      action: 'INCIDENT_CREATED',
      resourceType: 'security_incident',
      resourceId: incident.id,
      ipAddress: '0.0.0.0',
      newValue: {
        incidentNumber,
        severity: incident.severity,
        incidentType: incident.incidentType,
      },
    });

    logger.info(`[INCIDENT_RESPONSE] Created security incident ${incidentNumber} (Severity: ${incident.severity})`);
    return incident;
  }

  /**
   * List/Get Security Incidents with optional status & severity filters.
   */
  static async getIncidents(filters: { status?: string; severity?: string; page?: number; limit?: number }): Promise<any> {
    const page = Math.max(filters.page || 1, 1);
    const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;

    const [items, total] = await Promise.all([
      prisma.securityIncident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
          assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
          assessor: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
          breachReport: { select: { id: true, breachType: true, status: true } },
        },
      }),
      prisma.securityIncident.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single Security Incident details by ID.
   */
  static async getIncidentById(id: string): Promise<any> {
    const incident = await prisma.securityIncident.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assessor: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        breachReport: true,
      },
    });

    if (!incident) throw AppError.notFound('Security incident not found');
    return incident;
  }

  /**
   * Update Security Incident investigation notes, status, containment, or resolution.
   * (Authorized compliance staff only).
   */
  static async updateIncident(id: string, input: UpdateIncidentInput, actingUserId: string): Promise<any> {
    const existing = await prisma.securityIncident.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Security incident not found');

    const updateData: any = {};
    if (input.status) updateData.status = input.status;
    if (input.assignedUserId !== undefined) updateData.assignedUserId = input.assignedUserId || null;
    if (input.containmentActions !== undefined) updateData.containmentActions = input.containmentActions;
    if (input.investigationNotes !== undefined) updateData.investigationNotes = input.investigationNotes;
    if (input.resolution !== undefined) updateData.resolution = input.resolution;

    if (input.status === 'closed' && !existing.closedAt) {
      updateData.closedAt = new Date();
    }

    const updated = await prisma.securityIncident.update({
      where: { id },
      data: updateData,
      include: {
        reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assessor: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        breachReport: true,
      },
    });

    // Determine specific audit action
    let auditAction = 'INCIDENT_UPDATED';
    if (input.status === 'contained' && existing.status !== 'contained') auditAction = 'INCIDENT_CONTAINED';
    else if (input.status === 'resolved' && existing.status !== 'resolved') auditAction = 'INCIDENT_RESOLVED';
    else if (input.status === 'closed' && existing.status !== 'closed') auditAction = 'INCIDENT_CLOSED';

    await writeAuditLog({
      userId: actingUserId,
      action: auditAction,
      resourceType: 'security_incident',
      resourceId: updated.id,
      ipAddress: '0.0.0.0',
      newValue: {
        incidentNumber: updated.incidentNumber,
        status: updated.status,
        assignedUserId: updated.assignedUserId,
      },
    });

    return updated;
  }

  /**
   * Conduct CMIA / HIPAA Breach Determination & Escalation to R-45 Breach Report.
   * (Authorized compliance staff only).
   */
  static async assessBreachAndCMIA(id: string, input: AssessBreachInput, assessingUserId: string): Promise<any> {
    const incident = await prisma.securityIncident.findUnique({ where: { id } });
    if (!incident) throw AppError.notFound('Security incident not found');

    let breachReportId = incident.breachReportId;

    // Escalate to R-45 Breach Report if breach is determined and escalation is requested
    if (input.breachDetermined && input.escalateToBreachReport && !breachReportId) {
      // Calculate CMIA 15-day deadline & HIPAA 60-day deadline
      const discoveryDate = incident.discoveredAt;
      const cmiaDeadline = new Date(discoveryDate.getTime() + 15 * 24 * 60 * 60 * 1000);

      const breachReport = await prisma.breachReport.create({
        data: {
          reportedBy: assessingUserId,
          breachType: incident.incidentType,
          description: `Escalated from Incident ${incident.incidentNumber}: ${incident.title}. Rationale: ${input.assessmentRationale}`,
          patientsAffected: input.patientsAffected || 0,
          phiInvolved: input.isPhiInvolved,
          discoveryDate,
          cmiaDeadline,
          status: 'investigating',
          remediationSteps: incident.containmentActions || undefined,
        },
      });

      breachReportId = breachReport.id;
      logger.info(`[CMIA_ASSESSMENT] Escalated incident ${incident.incidentNumber} to Breach Report #${breachReport.id}`);
    }

    const updated = await prisma.securityIncident.update({
      where: { id },
      data: {
        isPhiInvolved: input.isPhiInvolved,
        breachDetermined: input.breachDetermined,
        assessmentRationale: input.assessmentRationale,
        assessedBy: assessingUserId,
        assessedAt: new Date(),
        breachReportId,
      },
      include: {
        reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        assessor: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        breachReport: true,
      },
    });

    await writeAuditLog({
      userId: assessingUserId,
      action: 'INCIDENT_BREACH_ASSESSED',
      resourceType: 'security_incident',
      resourceId: updated.id,
      ipAddress: '0.0.0.0',
      newValue: {
        incidentNumber: updated.incidentNumber,
        isPhiInvolved: updated.isPhiInvolved,
        breachDetermined: updated.breachDetermined,
        breachReportId: updated.breachReportId,
      },
    });

    return updated;
  }

  /**
   * Breach & Incident Monitoring Summary & List (R-44).
   * Surfaces open incidents, pending PHI/breach assessments, active breach reports,
   * deadline tracking (CMIA 15-day & HIPAA 60-day), and overdue detection.
   */
  static async getBreachMonitoringSummary(userId?: string, ipAddress?: string): Promise<any> {
    const now = new Date();

    const [openIncidents, pendingAssessments, unresolvedCritical, activeBreaches] = await Promise.all([
      // 1. Open/investigating/contained incidents
      prisma.securityIncident.findMany({
        where: { status: { in: ['open', 'investigating', 'contained'] } },
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
          assignedUser: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
          breachReport: { select: { id: true, status: true, cmiaDeadline: true } },
        },
      }),

      // 2. Incidents awaiting PHI/breach assessment
      prisma.securityIncident.findMany({
        where: { assessedAt: null, status: { not: 'closed' } },
        orderBy: { discoveredAt: 'asc' },
        include: {
          reporter: { select: { id: true, email: true, staffProfile: { select: { fullName: true } } } },
        },
      }),

      // 3. Unresolved high or critical severity incidents
      prisma.securityIncident.findMany({
        where: { severity: { in: ['high', 'critical'] }, status: { in: ['open', 'investigating', 'contained'] } },
        orderBy: { discoveredAt: 'asc' },
      }),

      // 4. Active breach reports (not closed)
      prisma.breachReport.findMany({
        where: { status: { not: 'closed' } },
        orderBy: { discoveryDate: 'desc' },
        include: {
          incidents: { select: { id: true, incidentNumber: true, title: true } },
        },
      }),
    ]);

    // Build actionable alert items with deadline calculations
    const alerts: any[] = [];

    // Add alerts for unresolved critical incidents
    for (const inc of unresolvedCritical) {
      alerts.push({
        id: `ALERT-INC-${inc.id}`,
        alertType: 'UNRESOLVED_CRITICAL_INCIDENT',
        severity: inc.severity,
        referenceId: inc.id,
        referenceNumber: inc.incidentNumber,
        title: `Unresolved ${inc.severity.toUpperCase()} Incident: ${inc.title}`,
        status: inc.status,
        discoveredAt: inc.discoveredAt,
        daysRemaining: null,
        isOverdue: false,
      });
    }

    // Add alerts for pending breach assessments
    for (const inc of pendingAssessments) {
      alerts.push({
        id: `ALERT-ASSESS-${inc.id}`,
        alertType: 'BREACH_ASSESSMENT_PENDING',
        severity: inc.severity === 'critical' || inc.severity === 'high' ? 'high' : 'medium',
        referenceId: inc.id,
        referenceNumber: inc.incidentNumber,
        title: `Pending PHI Breach Assessment: ${inc.title}`,
        status: inc.status,
        discoveredAt: inc.discoveredAt,
        daysRemaining: null,
        isOverdue: false,
      });
    }

    // Add alerts and calculate CMIA (15-day) & HIPAA (60-day) deadlines for active breaches
    for (const breach of activeBreaches) {
      const discovery = new Date(breach.discoveryDate);
      const cmiaDeadline = breach.cmiaDeadline || new Date(discovery.getTime() + 15 * 24 * 60 * 60 * 1000);
      const hipaaDeadline = new Date(discovery.getTime() + 60 * 24 * 60 * 60 * 1000);

      const cmiaDaysRemaining = Math.ceil((cmiaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const hipaaDaysRemaining = Math.ceil((hipaaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const isCmiaOverdue = cmiaDaysRemaining < 0 && !breach.caAgNotificationDate;
      const isHipaaOverdue = hipaaDaysRemaining < 0 && !breach.hhsNotificationDate;

      if (isCmiaOverdue) {
        alerts.push({
          id: `ALERT-CMIA-OVERDUE-${breach.id}`,
          alertType: 'CMIA_DEADLINE_OVERDUE',
          severity: 'critical',
          referenceId: breach.id,
          referenceNumber: `BREACH-${breach.id.slice(0, 8)}`,
          title: `CMIA 15-Day Breach Notice OVERDUE (${Math.abs(cmiaDaysRemaining)} days past deadline)`,
          status: breach.status,
          discoveryDate: breach.discoveryDate,
          cmiaDeadline,
          daysRemaining: cmiaDaysRemaining,
          isOverdue: true,
        });
      } else if (cmiaDaysRemaining <= 5 && !breach.caAgNotificationDate) {
        alerts.push({
          id: `ALERT-CMIA-APPROACHING-${breach.id}`,
          alertType: 'CMIA_DEADLINE_APPROACHING',
          severity: 'high',
          referenceId: breach.id,
          referenceNumber: `BREACH-${breach.id.slice(0, 8)}`,
          title: `CMIA 15-Day Deadline Approaching (${cmiaDaysRemaining} days remaining)`,
          status: breach.status,
          discoveryDate: breach.discoveryDate,
          cmiaDeadline,
          daysRemaining: cmiaDaysRemaining,
          isOverdue: false,
        });
      }


      if (isHipaaOverdue) {
        alerts.push({
          id: `ALERT-HIPAA-OVERDUE-${breach.id}`,
          alertType: 'HIPAA_DEADLINE_OVERDUE',
          severity: 'critical',
          referenceId: breach.id,
          referenceNumber: `BREACH-${breach.id.slice(0, 8)}`,
          title: `HIPAA HHS 60-Day Notice OVERDUE (${Math.abs(hipaaDaysRemaining)} days past deadline)`,
          status: breach.status,
          discoveryDate: breach.discoveryDate,
          hipaaDeadline,
          daysRemaining: hipaaDaysRemaining,
          isOverdue: true,
        });
      }
    }

    if (userId) {
      await writeAuditLog({
        userId,
        action: 'BREACH_MONITORING_VIEWED',
        resourceType: 'breach_report',
        resourceId: 'summary',
        ipAddress: ipAddress || '0.0.0.0',
      });
    }

    return {
      summary: {
        openIncidentsCount: openIncidents.length,
        pendingAssessmentCount: pendingAssessments.length,
        unresolvedHighCriticalCount: unresolvedCritical.length,
        activeBreachReportsCount: activeBreaches.length,
        overdueDeadlinesCount: alerts.filter(a => a.isOverdue).length,
      },
      alerts,
      openIncidents,
      pendingAssessments,
      activeBreaches,
    };
  }
}

