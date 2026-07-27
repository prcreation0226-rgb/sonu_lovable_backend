// Radiantilyk EMR — Consent Management Service
// Business logic for ConsentTemplate CRUD, Versioning, Assignment, and Digital Signature.
//
// Healthcare Guardrails:
// 1. Signed consents are IMMUTABLE (cannot be modified after signing)
// 2. ConsentVersion snapshots are append-only
// 3. ConsentAuditHistory tracks every action per signature

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { randomBytes } from 'crypto';
import {
  CreateConsentTemplateInput,
  UpdateConsentTemplateInput,
  CreateConsentVersionInput,
  CreateConsentAssignmentInput,
  SignConsentInput,
} from '../schemas/consent.schema';

export class ConsentService {
  // ==========================================
  // ---- CONSENT TEMPLATES ----
  // ==========================================

  static async createTemplate(input: CreateConsentTemplateInput, userId: string, ipAddress: string) {
    const template = await prisma.consentTemplate.create({
      data: {
        name: input.name,
        content: input.content,
        serviceId: input.serviceId || undefined,
        version: 1,
        isActive: true,
      },
      include: { service: { select: { id: true, name: true } } },
    });

    // Create initial version snapshot
    await prisma.consentVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        content: input.content,
        effectiveDate: new Date(),
      },
    });

    await writeAuditLog({
      userId,
      action: 'CONSENT_TEMPLATE_CREATED',
      resourceType: 'consent_template',
      resourceId: template.id,
      ipAddress,
      newValue: { name: input.name },
    });

    return template;
  }

  static async getTemplates(includeInactive: boolean = false) {
    const where: any = { deletedAt: null };
    if (!includeInactive) where.isActive = true;

    return prisma.consentTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        service: { select: { id: true, name: true } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
  }

  static async getTemplateById(templateId: string) {
    const template = await prisma.consentTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      include: {
        service: { select: { id: true, name: true } },
        versions: { orderBy: { versionNumber: 'desc' } },
        assignments: {
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
            signatures: { select: { id: true, signedAt: true, clientEmail: true } },
          },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!template) throw AppError.notFound('Consent Template');
    return template;
  }

  static async updateTemplate(templateId: string, input: UpdateConsentTemplateInput, userId: string, ipAddress: string) {
    const template = await prisma.consentTemplate.findFirst({ where: { id: templateId, deletedAt: null } });
    if (!template) throw AppError.notFound('Consent Template');

    const updated = await prisma.consentTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name ?? template.name,
        content: input.content ?? template.content,
        serviceId: input.serviceId !== undefined ? input.serviceId : template.serviceId,
        isActive: input.isActive ?? template.isActive,
      },
    });

    await writeAuditLog({
      userId,
      action: 'CONSENT_TEMPLATE_UPDATED',
      resourceType: 'consent_template',
      resourceId: templateId,
      ipAddress,
    });

    return updated;
  }

  static async deleteTemplate(templateId: string, userId: string, ipAddress: string) {
    const template = await prisma.consentTemplate.findFirst({ where: { id: templateId, deletedAt: null } });
    if (!template) throw AppError.notFound('Consent Template');

    await prisma.consentTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await writeAuditLog({
      userId,
      action: 'CONSENT_TEMPLATE_DELETED',
      resourceType: 'consent_template',
      resourceId: templateId,
      ipAddress,
    });

    return { message: 'Consent template soft-deleted successfully' };
  }

  // ==========================================
  // ---- CONSENT VERSIONS ----
  // ==========================================

  static async createVersion(templateId: string, input: CreateConsentVersionInput, userId: string, ipAddress: string) {
    const template = await prisma.consentTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!template) throw AppError.notFound('Consent Template');

    const nextVersion = (template.versions[0]?.versionNumber || 0) + 1;

    const [version] = await prisma.$transaction([
      prisma.consentVersion.create({
        data: {
          templateId,
          versionNumber: nextVersion,
          content: input.content,
          effectiveDate: new Date(input.effectiveDate),
        },
      }),
      prisma.consentTemplate.update({
        where: { id: templateId },
        data: { version: nextVersion, content: input.content },
      }),
    ]);

    await writeAuditLog({
      userId,
      action: 'CONSENT_VERSION_CREATED',
      resourceType: 'consent_template',
      resourceId: templateId,
      ipAddress,
      newValue: { versionNumber: nextVersion },
    });

    return version;
  }

  // ==========================================
  // ---- CONSENT ASSIGNMENTS ----
  // ==========================================

  static async createAssignment(input: CreateConsentAssignmentInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const template = await prisma.consentTemplate.findFirst({ where: { id: input.templateId, deletedAt: null, isActive: true } });
    if (!template) throw AppError.notFound('Consent Template');

    const assignment = await prisma.consentAssignment.create({
      data: {
        patientId: input.patientId,
        templateId: input.templateId,
        appointmentId: input.appointmentId || undefined,
        assignedBy: userId,
        status: 'pending',
      },
      include: {
        template: { select: { id: true, name: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Generate signature token
    const token = randomBytes(32).toString('hex');
    await prisma.consentSignature.create({
      data: {
        assignmentId: assignment.id,
        templateId: input.templateId,
        patientId: input.patientId,
        clientEmail: patient.email,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day expiry
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'CONSENT_ASSIGNED',
      resourceType: 'consent_assignment',
      resourceId: assignment.id,
      ipAddress,
    });

    return assignment;
  }

  static async getPatientAssignments(patientId: string) {
    return prisma.consentAssignment.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true, version: true } },
        signatures: {
          select: { id: true, signedAt: true, clientEmail: true, ipAddress: true },
        },
      },
    });
  }

  // ==========================================
  // ---- CONSENT SIGNATURES ----
  // ==========================================

  static async signConsent(assignmentId: string, input: SignConsentInput, userId: string, ipAddress: string, userAgent: string) {
    const assignment = await prisma.consentAssignment.findUnique({
      where: { id: assignmentId },
      include: { signatures: true },
    });
    if (!assignment) throw AppError.notFound('Consent Assignment');

    if (assignment.status === 'signed') {
      throw AppError.badRequest('This consent has already been signed');
    }

    // Find the pending signature record
    const pendingSignature = assignment.signatures.find(s => !s.signedAt);
    if (!pendingSignature) throw AppError.badRequest('No pending signature found for this assignment');

    // Check expiry
    if (pendingSignature.expiresAt && new Date() > pendingSignature.expiresAt) {
      throw AppError.badRequest('Signature link has expired. Please request a new consent assignment.');
    }

    const now = new Date();

    // Sign the consent (IMMUTABLE after this point)
    const [signature] = await prisma.$transaction([
      prisma.consentSignature.update({
        where: { id: pendingSignature.id },
        data: {
          signatureData: input.signatureData,
          clientEmail: input.clientEmail,
          ipAddress,
          userAgent,
          signedAt: now,
        },
      }),
      prisma.consentAssignment.update({
        where: { id: assignmentId },
        data: { status: 'signed' },
      }),
    ]);

    // Write consent audit history
    await prisma.consentAuditHistory.create({
      data: {
        signatureId: signature.id,
        action: 'CONSENT_SIGNED',
        performedBy: userId,
        ipAddress,
      },
    });

    await writeAuditLog({
      userId,
      patientId: assignment.patientId,
      action: 'CONSENT_SIGNED',
      resourceType: 'consent_signature',
      resourceId: signature.id,
      ipAddress,
    });

    return signature;
  }

  static async getSignatureById(signatureId: string) {
    const signature = await prisma.consentSignature.findUnique({
      where: { id: signatureId },
      include: {
        assignment: {
          include: {
            template: { select: { id: true, name: true, version: true } },
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        auditHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!signature) throw AppError.notFound('Consent Signature');
    return signature;
  }
}
