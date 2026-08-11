// Radiantilyk EMR — Clinical EMR Service
// Manages Encounters, SOAP Notes, Immutability Guards, Cosign Workflows, Addendums, 
// Note Signatures, and Versions.
//
// Healthcare Safety Guardrails Enforced:
// 1. Note Immutability: Once status is SIGNED or LOCKED, editing or deleting is strictly forbidden.
// 2. Addendum Workflow: Amendments to signed notes create a NoteAddendum append-only record. Original note is NEVER edited.
// 3. RN / Cosign Queue: RNs/Injectors create notes in draft or pending_cosign status. MD/NP reviews and signs.

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import {
  CreateEncounterInput,
  UpdateEncounterInput,
  CreateSoapNoteInput,
  UpdateSoapNoteInput,
  SignSoapNoteInput,
  AddendumInput,
} from '../schemas/clinical.schema';

export class ClinicalService {
  // ==========================================
  // ---- ENCOUNTERS ----
  // ==========================================

  static async createEncounter(input: CreateEncounterInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const encounter = await prisma.encounter.create({
      data: {
        patientId: input.patientId,
        providerId: input.providerId,
        locationId: input.locationId || undefined,
        appointmentId: input.appointmentId || undefined,
        encounterType: input.encounterType,
        chiefComplaint: input.chiefComplaint,
        encounterDate: new Date(),
        status: 'in_progress',
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
        provider: { select: { id: true, fullName: true, title: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'ENCOUNTER_CREATED',
      resourceType: 'encounter',
      resourceId: encounter.id,
      ipAddress,
    });

    return encounter;
  }

  static async getEncounterById(encounterId: string) {
    const encounter = await prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true, medicalAlerts: true } },
        provider: { select: { id: true, fullName: true, title: true } },
        location: { select: { id: true, name: true } },
        soapNotes: {
          where: { deletedAt: null },
          include: {
            addendums: { orderBy: { createdAt: 'asc' } },
            cosigner: { select: { id: true, fullName: true } },
            signatures: true,
            versions: { orderBy: { versionNumber: 'desc' } },
          },
        },
      },
    });

    if (!encounter) throw AppError.notFound('Encounter');
    return encounter;
  }

  static async updateEncounterStatus(encounterId: string, status: 'in_progress' | 'completed' | 'cancelled', userId: string, ipAddress: string) {
    const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, deletedAt: null } });
    if (!encounter) throw AppError.notFound('Encounter');

    const completedAt = status === 'completed' ? new Date() : undefined;

    const updated = await prisma.encounter.update({
      where: { id: encounterId },
      data: { status, completedAt },
    });

    await writeAuditLog({
      userId,
      patientId: encounter.patientId,
      action: 'ENCOUNTER_STATUS_UPDATED',
      resourceType: 'encounter',
      resourceId: encounterId,
      ipAddress,
      newValue: { status },
    });

    return updated;
  }

  // ==========================================
  // ---- SOAP NOTES & IMMUTABILITY GUARD ----
  private static async getStaffProfile(userId: string) {
    const staff = await prisma.staffProfile.findFirst({ where: { userId, deletedAt: null } });
    if (!staff) {
      throw AppError.forbidden('Staff profile required for clinical charting actions');
    }
    return staff;
  }

  // ==========================================
  // 3. SOAP NOTES & CLINICAL CHARTING
  // ==========================================

  static async createSoapNote(input: CreateSoapNoteInput, userId: string, ipAddress: string) {
    const staff = await ClinicalService.getStaffProfile(userId);
    const encounter = await prisma.encounter.findFirst({ where: { id: input.encounterId, deletedAt: null } });
    if (!encounter) throw AppError.notFound('Encounter');

    const status = input.status || 'draft';

    const note = await prisma.soapNote.create({
      data: {
        encounterId: input.encounterId,
        patientId: input.patientId,
        authorId: staff.id,
        subjective: input.subjective,
        objective: input.objective,
        assessment: input.assessment,
        plan: input.plan,
        status,
        cosignedBy: input.cosignerId || undefined,
        signedAt: status === 'signed' ? new Date() : undefined,
        lockedAt: status === 'signed' ? new Date() : undefined,
        versions: {
          create: {
            versionNumber: 1,
            subjective: input.subjective,
            objective: input.objective,
            assessment: input.assessment,
            plan: input.plan,
            createdBy: userId,
          },
        },
      },
      include: {
        author: { select: { id: true, fullName: true, title: true } },
        cosigner: { select: { id: true, fullName: true, title: true } },
      },
    });

    if (status === 'pending_cosign') {
      await prisma.cosignQueue.create({
        data: {
          noteId: note.id,
          authorId: staff.id,
          assignedToId: input.cosignerId || undefined,
          status: 'pending',
        },
      });
    }

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'SOAP_NOTE_CREATED',
      resourceType: 'soap_note',
      resourceId: note.id,
      ipAddress,
      newValue: { status },
    });

    return note;
  }

  /**
   * Update Draft SOAP Note (IMMUTABILITY & OWNERSHIP GUARD).
   */
  static async updateSoapNote(noteId: string, input: UpdateSoapNoteInput, userId: string, ipAddress: string) {
    const staff = await ClinicalService.getStaffProfile(userId);
    const note = await prisma.soapNote.findFirst({
      where: { id: noteId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!note) throw AppError.notFound('SOAP Note');

    // OWNERSHIP GUARD: Only the original author can edit their own draft note
    if (note.authorId !== staff.id) {
      throw AppError.forbidden('You can only edit your own draft notes');
    }

    // IMMUTABILITY GUARD: Signed, cosigned, or locked notes CANNOT be edited
    if (note.status !== 'draft') {
      throw AppError.badRequest(
        `SOAP note #${noteId} is in '${note.status}' status and cannot be edited. Use the Addendum API (/soap-notes/${noteId}/addendum) to append amendments.`
      );
    }

    const currentVersion = note.versions[0]?.versionNumber || 1;
    const nextVersion = currentVersion + 1;
    const newStatus = input.status || note.status;

    const updated = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        subjective: input.subjective || note.subjective,
        objective: input.objective || note.objective,
        assessment: input.assessment || note.assessment,
        plan: input.plan || note.plan,
        status: newStatus,
        cosignedBy: input.cosignerId !== undefined ? input.cosignerId : note.cosignedBy,
        versions: {
          create: {
            versionNumber: nextVersion,
            subjective: input.subjective || note.subjective,
            objective: input.objective || note.objective,
            assessment: input.assessment || note.assessment,
            plan: input.plan || note.plan,
            createdBy: userId,
          },
        },
      },
      include: {
        author: { select: { id: true, fullName: true } },
        cosigner: { select: { id: true, fullName: true } },
      },
    });

    if (newStatus === 'pending_cosign') {
      await prisma.cosignQueue.upsert({
        where: { noteId },
        update: { status: 'pending', assignedToId: input.cosignerId || undefined },
        create: { noteId, authorId: note.authorId, assignedToId: input.cosignerId || undefined, status: 'pending' },
      });
    }

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: 'SOAP_NOTE_UPDATED',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { version: nextVersion, status: updated.status },
    });

    return updated;
  }

  /**
   * Author Sign Own Note / Submit for Cosign.
   */
  static async signOwnNote(noteId: string, input: SignSoapNoteInput, userId: string, userRoles: string[], ipAddress: string) {
    const staff = await ClinicalService.getStaffProfile(userId);
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.authorId !== staff.id) {
      throw AppError.forbidden('You can only sign your own notes');
    }

    if (note.status !== 'draft') {
      throw AppError.badRequest(`SOAP note #${noteId} is in '${note.status}' status and cannot be signed as draft`);
    }

    const isSupervising = userRoles.includes('medical_director') || userRoles.includes('nurse_practitioner');
    const newStatus = isSupervising ? (input.lockNote ? 'locked' : 'signed') : 'pending_cosign';
    const now = new Date();

    const updated = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        status: newStatus,
        signedAt: now,
        cosignedBy: isSupervising ? staff.id : undefined,
        cosignedAt: isSupervising ? now : undefined,
        lockedAt: isSupervising && input.lockNote ? now : undefined,
        signatures: {
          create: {
            signerId: staff.id,
            signatureType: isSupervising ? 'digital_cosign' : 'author_signature',
            ipAddress,
            signedAt: now,
          },
        },
      },
      include: {
        author: { select: { id: true, fullName: true, title: true } },
        cosigner: { select: { id: true, fullName: true, title: true } },
        signatures: true,
      },
    });

    if (!isSupervising) {
      await prisma.cosignQueue.upsert({
        where: { noteId },
        update: { status: 'pending', assignedToId: input.cosignerId || undefined },
        create: { noteId, authorId: note.authorId, assignedToId: input.cosignerId || undefined, status: 'pending' },
      });
    }

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: isSupervising ? 'SOAP_NOTE_SIGNED' : 'SOAP_NOTE_SUBMITTED_FOR_COSIGN',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { status: newStatus, signedAt: now },
    });

    return updated;
  }

  /**
   * Cosign SOAP Note (Supervising Provider Review Workflow).
   */
  static async cosignNote(noteId: string, input: SignSoapNoteInput, userId: string, ipAddress: string) {
    const staff = await ClinicalService.getStaffProfile(userId);
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.status !== 'pending_cosign') {
      throw AppError.badRequest(`SOAP note #${noteId} is in '${note.status}' status and cannot be cosigned. Note must be in 'pending_cosign' status.`);
    }

    const finalStatus = input.lockNote ? 'locked' : 'cosigned';
    const now = new Date();

    const signed = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        status: finalStatus,
        cosignedBy: staff.id,
        cosignedAt: now,
        lockedAt: input.lockNote ? now : undefined,
        signatures: {
          create: {
            signerId: staff.id,
            signatureType: 'digital_cosign',
            ipAddress,
            signedAt: now,
          },
        },
      },
      include: {
        author: { select: { id: true, fullName: true } },
        cosigner: { select: { id: true, fullName: true } },
        signatures: true,
      },
    });

    await prisma.cosignQueue.updateMany({
      where: { noteId },
      data: { status: 'resolved', resolvedAt: now },
    });

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: 'SOAP_NOTE_COSIGNED',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { status: finalStatus, cosignedAt: now },
    });

    return signed;
  }

  /**
   * Reject / Return SOAP Note for Correction.
   */
  static async rejectNote(noteId: string, reason: string, userId: string, ipAddress: string) {
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.status !== 'pending_cosign') {
      throw AppError.badRequest(`SOAP note #${noteId} is in '${note.status}' status and cannot be returned for correction.`);
    }

    const updated = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        status: 'draft',
        additionalData: {
          ...(typeof note.additionalData === 'object' && note.additionalData !== null ? note.additionalData : {}),
          lastReturnedReason: reason,
          lastReturnedAt: new Date().toISOString(),
        },
      },
      include: {
        author: { select: { id: true, fullName: true, title: true } },
      },
    });

    await prisma.cosignQueue.updateMany({
      where: { noteId },
      data: { status: 'rejected' },
    });

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: 'SOAP_NOTE_RETURNED_FOR_CORRECTION',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { status: 'draft', reason },
    });

    return updated;
  }

  /**
   * Sign & Lock SOAP Note (Generic compatibility path).
   */
  static async signSoapNote(noteId: string, input: SignSoapNoteInput, userId: string, ipAddress: string) {
    return this.cosignNote(noteId, input, userId, ipAddress);
  }

  /**
   * Append Addendum to Signed/Locked SOAP Note (Original note text is NEVER touched).
   */
  static async addAddendum(noteId: string, input: AddendumInput, userId: string, ipAddress: string) {
    const staff = await ClinicalService.getStaffProfile(userId);
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.status !== 'signed' && note.status !== 'cosigned' && note.status !== 'locked') {
      throw AppError.badRequest(`SOAP note #${noteId} is in '${note.status}' status. Addendums can only be appended to signed or locked notes.`);
    }

    const addendum = await prisma.noteAddendum.create({
      data: {
        noteId,
        patientId: note.patientId,
        authorId: staff.id,
        requestedBy: 'patient',
        reason: input.reason,
        addendumText: input.addendumText,
      },
    });

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: 'SOAP_NOTE_ADDENDUM_APPENDED',
      resourceType: 'soap_addendum',
      resourceId: addendum.id,
      ipAddress,
      newValue: { reason: input.reason },
    });

    return addendum;
  }

  /**
   * Get Cosign Queue for MD / NP Supervision Review.
   */
  static async getCosignQueue(cosignerId?: string) {
    const where: any = {
      status: 'pending',
    };

    if (cosignerId) {
      // Resolve user ID to staff profile ID to ensure correct lookup
      const staffProfile = await prisma.staffProfile.findFirst({
        where: {
          OR: [
            { userId: cosignerId },
            { id: cosignerId },
          ],
          deletedAt: null,
        },
      });
      const resolvedStaffId = staffProfile ? staffProfile.id : cosignerId;

      where.OR = [
        { assignedToId: resolvedStaffId },
        { assignedToId: null },
      ];
    }

    return prisma.cosignQueue.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
      include: {
        note: {
          select: {
            id: true,
            subjective: true,
            objective: true,
            assessment: true,
            plan: true,
            status: true,
            createdAt: true,
            signedAt: true,
            patient: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        author: { select: { id: true, fullName: true, title: true } },
      },
    });
  }

  /**
   * Get List of SOAP Notes (Patient / Chart query).
   */
  static async getSoapNotes(patientId?: string, clientEmail?: string) {
    const where: any = { deletedAt: null };
    if (patientId) where.patientId = patientId;
    if (clientEmail) {
      where.patient = { email: { equals: clientEmail.toLowerCase() } };
    }

    return prisma.soapNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        author: { select: { id: true, fullName: true, title: true } },
        cosigner: { select: { id: true, fullName: true, title: true } },
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        encounter: { select: { id: true, encounterType: true, encounterDate: true } },
      },
    });
  }

  /**
   * Medical Director Compliance & Signature Queue.
   * Calculates monthly status (pending, signed, overdue) for GFEs and Assessments.
   */
  static async getMdComplianceQueue(filters: { month?: string; status?: string; type?: string }) {
    const currentMonthStr = new Date().toISOString().slice(0, 7); // e.g. "2026-08"

    // 1. Fetch GFEs
    const gfes = await prisma.gfeForm.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        provider: { select: { id: true, fullName: true, title: true } },
      },
    });

    // 2. Fetch SOAP Notes / Assessments
    const notes = await prisma.soapNote.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        author: { select: { id: true, fullName: true, title: true } },
        cosigner: { select: { id: true, fullName: true, title: true } },
        appointment: {
          select: {
            id: true,
            appointmentServices: {
              include: { service: { select: { name: true } } },
            },
          },
        },
      },
    });

    const items: Array<{
      id: string;
      type: 'gfe' | 'assessment';
      patientName: string;
      patientId: string;
      serviceName: string;
      providerName: string;
      createdAt: string;
      signedAt: string | null;
      month: string;
      status: 'pending' | 'signed' | 'overdue';
      canSign: boolean;
    }> = [];

    // Process GFEs
    for (const g of gfes) {
      const createdIso = g.createdAt.toISOString();
      const month = createdIso.slice(0, 7);
      const isSigned = !!g.signedAt || g.status === 'signed';

      let docStatus: 'pending' | 'signed' | 'overdue' = 'pending';
      if (isSigned) {
        docStatus = 'signed';
      } else if (month < currentMonthStr) {
        docStatus = 'overdue';
      }

      items.push({
        id: g.id,
        type: 'gfe',
        patientName: `${g.patient.firstName || ''} ${g.patient.lastName || ''}`.trim() || g.patient.email,
        patientId: g.patientId,
        serviceName: 'Good Faith Exam (GFE)',
        providerName: g.provider?.fullName || 'Clinician',
        createdAt: createdIso,
        signedAt: g.signedAt ? g.signedAt.toISOString() : null,
        month,
        status: docStatus,
        canSign: !isSigned,
      });
    }

    // Process SOAP Notes / Assessments
    for (const n of notes) {
      const createdIso = n.createdAt.toISOString();
      const month = createdIso.slice(0, 7);
      const isSigned = !!n.cosignedAt || n.status === 'cosigned' || n.status === 'signed';

      let docStatus: 'pending' | 'signed' | 'overdue' = 'pending';
      if (isSigned) {
        docStatus = 'signed';
      } else if (month < currentMonthStr) {
        docStatus = 'overdue';
      }

      const serviceNames = n.appointment?.appointmentServices
        ? n.appointment.appointmentServices.map(as => as.service.name).join(', ')
        : 'Clinical Assessment';

      items.push({
        id: n.id,
        type: 'assessment',
        patientName: `${n.patient.firstName || ''} ${n.patient.lastName || ''}`.trim() || n.patient.email,
        patientId: n.patientId,
        serviceName: serviceNames || 'Clinical Assessment',
        providerName: n.author?.fullName || 'Clinician',
        createdAt: createdIso,
        signedAt: n.cosignedAt ? n.cosignedAt.toISOString() : null,
        month,
        status: docStatus,
        canSign: !isSigned,
      });
    }

    // Apply filtering
    let filtered = items;
    if (filters.month) {
      filtered = filtered.filter(i => i.month === filters.month);
    }
    if (filters.status) {
      filtered = filtered.filter(i => i.status === filters.status);
    }
    if (filters.type) {
      filtered = filtered.filter(i => i.type === filters.type);
    }

    return filtered;
  }

  /**
   * Bulk Sign selected GFE & Assessment records.
   * Validates every record, applies signature, updates DB, creates audit trail for each record.
   */
  static async bulkSignMdDocuments(
    items: Array<{ id: string; type: 'gfe' | 'assessment' }>,
    mdUserId: string,
    ipAddress: string,
    signatureData?: string
  ) {
    const mdProfile = await prisma.staffProfile.findFirst({ where: { userId: mdUserId, deletedAt: null } });

    let signedCount = 0;
    const now = new Date();

    for (const item of items) {
      if (item.type === 'gfe') {
        const gfe = await prisma.gfeForm.findFirst({
          where: { id: item.id, deletedAt: null },
        });

        // Skip if not found or already signed
        if (!gfe || gfe.signedAt || gfe.status === 'signed') continue;

        await prisma.gfeForm.update({
          where: { id: item.id },
          data: {
            status: 'signed',
            signedAt: now,
          },
        });

        await writeAuditLog({
          userId: mdUserId,
          patientId: gfe.patientId,
          action: 'GFE_BULK_SIGNED',
          resourceType: 'gfe_form',
          resourceId: gfe.id,
          ipAddress,
          newValue: { source: 'bulk', signerId: mdUserId, timestamp: now.toISOString() },
        });

        signedCount++;
      } else if (item.type === 'assessment') {
        const note = await prisma.soapNote.findFirst({
          where: { id: item.id, deletedAt: null },
        });

        // Skip if not found or already signed/cosigned
        if (!note || note.cosignedAt || note.status === 'cosigned' || note.status === 'signed') continue;

        await prisma.soapNote.update({
          where: { id: item.id },
          data: {
            status: 'cosigned',
            cosignedBy: mdProfile?.id || undefined,
            cosignedAt: now,
            lockedAt: now,
          },
        });

        if (mdProfile) {
          await prisma.noteSignature.create({
            data: {
              noteId: note.id,
              signerId: mdProfile.id,
              signatureType: 'cosign',
              signatureData: signatureData || 'MD Bulk E-Signature Attestation',
              ipAddress,
              signedAt: now,
            },
          });
        }

        await writeAuditLog({
          userId: mdUserId,
          patientId: note.patientId,
          action: 'ASSESSMENT_BULK_SIGNED',
          resourceType: 'soap_note',
          resourceId: note.id,
          ipAddress,
          newValue: { source: 'bulk', signerId: mdUserId, timestamp: now.toISOString() },
        });

        signedCount++;
      }
    }

    return { signedCount };
  }

  /**
   * Monthly Compliance & Patient Activity Report (No Financial Info).
   */
  static async getMdComplianceReport(month?: string) {
    const targetMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);

    const [y, m] = targetMonth.split('-').map(Number);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    // 1. Total patients seen in month
    const appts = await prisma.appointment.findMany({
      where: {
        startAt: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      select: { patientId: true },
    });
    const uniquePatientsSeen = new Set(appts.map(a => a.patientId)).size;

    // 2. GFEs created in target month
    const gfes = await prisma.gfeForm.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
    });

    const totalGfe = gfes.length;
    const gfeSigned = gfes.filter(g => !!g.signedAt || g.status === 'signed').length;
    const gfePending = totalGfe - gfeSigned;

    // 3. Assessments created in target month
    const notes = await prisma.soapNote.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
    });

    const totalAssessments = notes.length;
    const assessmentsSigned = notes.filter(n => !!n.cosignedAt || n.status === 'cosigned' || n.status === 'signed').length;
    const assessmentsPending = totalAssessments - assessmentsSigned;

    // 4. Overdue signatures (created BEFORE targetMonth and still unsigned)
    const overdueGfes = await prisma.gfeForm.count({
      where: {
        createdAt: { lt: startDate },
        signedAt: null,
        status: { not: 'signed' },
        deletedAt: null,
      },
    });

    const overdueNotes = await prisma.soapNote.count({
      where: {
        createdAt: { lt: startDate },
        cosignedAt: null,
        status: { notIn: ['cosigned', 'signed'] },
        deletedAt: null,
      },
    });

    return {
      month: targetMonth,
      totalPatientsSeen: uniquePatientsSeen,
      totalGfe,
      gfeSigned,
      gfePending,
      totalAssessments,
      assessmentsSigned,
      assessmentsPending,
      overdueSignatures: overdueGfes + overdueNotes,
    };
  }

  /**
   * Recurring Persistent Notifications for Medical Director.
   * Deduplicated per MD/month using NotificationQueue model.
   * Remains active until all pending & overdue signatures are completed, then marks resolved.
   */
  static async getMdNotifications(mdUserId: string) {
    const queue = await this.getMdComplianceQueue({});
    const unsignedItems = queue.filter(q => q.status === 'pending' || q.status === 'overdue');
    const currentMonthStr = new Date().toISOString().slice(0, 7); // e.g. "2026-08"
    const triggerEvent = `MD_MONTHLY_COMPLIANCE_${currentMonthStr}`;

    // If all items are signed (0 unsigned) -> mark any existing NotificationQueue records resolved and return empty
    if (unsignedItems.length === 0) {
      await prisma.notificationQueue.updateMany({
        where: {
          recipient: mdUserId,
          triggerEvent,
          status: { in: ['queued', 'active', 'pending'] },
        },
        data: { status: 'resolved' },
      }).catch(() => {});

      return { notifications: [] };
    }

    const pendingCount = unsignedItems.filter(i => i.status === 'pending').length;
    const overdueCount = unsignedItems.filter(i => i.status === 'overdue').length;
    const totalUnsigned = unsignedItems.length;

    const notifTitle = 'Monthly Clinical Compliance Action Required';
    const notifMessage = `You have ${totalUnsigned} document(s) requiring Medical Director signature (${pendingCount} Pending, ${overdueCount} Overdue).`;
    const actionLink = '/staff/clinical-reviews?tab=queue';

    const notifPayload = {
      id: `md-notif-${currentMonthStr}-${mdUserId}`,
      title: notifTitle,
      message: notifMessage,
      link: actionLink,
      type: overdueCount > 0 ? 'CRITICAL' : 'WARNING',
      pendingCount,
      overdueCount,
      totalUnsigned,
      month: currentMonthStr,
      createdAt: new Date().toISOString(),
    };

    // Deduplicated persistence in database NotificationQueue
    try {
      const existing = await prisma.notificationQueue.findFirst({
        where: {
          recipient: mdUserId,
          triggerEvent,
        },
      });

      if (existing) {
        await prisma.notificationQueue.update({
          where: { id: existing.id },
          data: {
            subject: notifTitle,
            body: JSON.stringify(notifPayload),
            status: 'queued',
          },
        });
      } else {
        await prisma.notificationQueue.create({
          data: {
            channel: 'in_app',
            recipient: mdUserId,
            subject: notifTitle,
            body: JSON.stringify(notifPayload),
            triggerEvent,
            containsPhi: false,
            status: 'queued',
          },
        });
      }
    } catch {
      // Non-fatal fallback
    }

    return { notifications: [notifPayload] };
  }
}
