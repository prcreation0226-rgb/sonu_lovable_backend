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
  // ==========================================

  static async createSoapNote(input: CreateSoapNoteInput, userId: string, ipAddress: string) {
    const encounter = await prisma.encounter.findFirst({ where: { id: input.encounterId, deletedAt: null } });
    if (!encounter) throw AppError.notFound('Encounter');

    const status = input.status || 'draft';

    const note = await prisma.soapNote.create({
      data: {
        encounterId: input.encounterId,
        patientId: input.patientId,
        authorId: userId,
        subjective: input.subjective,
        objective: input.objective,
        assessment: input.assessment,
        plan: input.plan,
        status,
        cosignedBy: input.cosignerId || undefined,
        signedAt: status === 'signed' ? new Date() : undefined,
        lockedAt: status === 'signed' ? new Date() : undefined,
        // Store initial version 1
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

    // If status is pending_cosign, add to CosignQueue
    if (status === 'pending_cosign') {
      await prisma.cosignQueue.create({
        data: {
          noteId: note.id,
          authorId: userId,
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
   * Update Draft SOAP Note (IMMUTABILITY GUARD: Rejects if SIGNED or LOCKED).
   */
  static async updateSoapNote(noteId: string, input: UpdateSoapNoteInput, userId: string, ipAddress: string) {
    const note = await prisma.soapNote.findFirst({
      where: { id: noteId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!note) throw AppError.notFound('SOAP Note');

    // IMMUTABILITY GUARD: Signed/Locked notes CANNOT be edited
    if (note.status === 'signed' || note.status === 'locked') {
      throw AppError.badRequest(
        `SOAP note #${noteId} is '${note.status}' and cannot be edited. Use the Addendum API (/soap-notes/${noteId}/addendum) to append amendments.`
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

    // If transitioned to pending_cosign, update or create CosignQueue entry
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
   * Cosign & Sign / Lock SOAP Note (MD / NP Review Workflow).
   */
  static async signSoapNote(noteId: string, input: SignSoapNoteInput, userId: string, ipAddress: string) {
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.status === 'locked') {
      throw AppError.badRequest('SOAP Note is already signed and locked');
    }

    const finalStatus = input.lockNote ? 'locked' : 'signed';
    const now = new Date();

    const signed = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        status: finalStatus,
        cosignedBy: userId,
        cosignedAt: now,
        signedAt: now,
        lockedAt: input.lockNote ? now : undefined,
        signatures: {
          create: {
            signerId: userId,
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

    // Resolve CosignQueue item if present
    await prisma.cosignQueue.updateMany({
      where: { noteId },
      data: { status: 'resolved', resolvedAt: now },
    });

    await writeAuditLog({
      userId,
      patientId: note.patientId,
      action: 'SOAP_NOTE_COSIGNED_AND_LOCKED',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { status: finalStatus, signedAt: now },
    });

    return signed;
  }

  /**
   * Append Addendum to Signed/Locked SOAP Note (Original note text is NEVER touched).
   */
  static async addAddendum(noteId: string, input: AddendumInput, userId: string, ipAddress: string) {
    const note = await prisma.soapNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) throw AppError.notFound('SOAP Note');

    if (note.status !== 'signed' && note.status !== 'locked') {
      throw AppError.badRequest('Addendums can only be appended to signed or locked SOAP notes');
    }

    const addendum = await prisma.noteAddendum.create({
      data: {
        noteId,
        patientId: note.patientId,
        authorId: userId,
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
      where.assignedToId = cosignerId;
    }

    return prisma.cosignQueue.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
      include: {
        note: {
          select: { id: true, subjective: true, objective: true, assessment: true, plan: true, createdAt: true },
        },
        author: { select: { id: true, fullName: true, title: true } },
      },
    });
  }

  /**
   * Get List of SOAP Notes (Patient / Chart query).
   */
  static async getSoapNotes(patientId?: string) {
    const where: any = { deletedAt: null };
    if (patientId) where.patientId = patientId;

    return prisma.soapNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
