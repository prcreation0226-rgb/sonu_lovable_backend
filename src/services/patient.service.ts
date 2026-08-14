// Radiantilyk EMR — Patient PHI Service
// Manages Patient Profiles, Demographics, Medical History, Allergies, Medications, 
// S3 Document/Photo Presigned Uploads, Communication Preferences, and CMIA 7-Year Retention Checks.
//
// Compliance Guardrails:
// - Hard Delete Blocked: All deletions set deletedAt timestamp.
// - CMIA Retention Rule: California Health & Safety Code §123145 requires retaining adult medical records
//   for at least 7 years. PHI deletion requests submitted before 7 years are flagged as retention_not_met.
// - Presigned S3 URLs: All documents & photos uploaded directly to S3 via SSE-S3 presigned URLs.

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { signMarketingUnsubscribeToken, verifyMarketingUnsubscribeToken } from '../utils/jwt';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  generatePatientDocumentKey,
  generatePatientPhotoKey,
} from './s3.service';
import {
  CreatePatientInput,
  UpdatePatientInput,
  DemographicsInput,
  MedicalHistoryInput,
  AllergyInput,
  MedicationInput,
  DocumentUploadRequestInput,
  PhotoUploadRequestInput,
  CommPrefInput,
  PublicMarketingConsentInput,
  UnsubscribeTokenInput,
  CmiaDeletionRequestInput,
  CreateAmendmentRequestInput,
} from '../schemas/patient.schema';



const CMIA_RETENTION_YEARS = 7;

export class PatientService {
  /**
   * Create a new Patient Profile.
   */
  static async createPatient(input: CreatePatientInput, userId: string, ipAddress: string) {
    const existing = await prisma.patientProfile.findFirst({
      where: { email: input.email, deletedAt: null },
    });

    if (existing) {
      throw AppError.conflict('A patient with this email address already exists');
    }

    const patient = await prisma.patientProfile.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gender: input.gender,
        medicalAlerts: input.medicalAlerts,
        marketingConsentAt: input.marketingConsent ? new Date() : undefined,
        nppAcknowledgedAt: input.nppAcknowledged ? new Date() : undefined,
        communicationPref: {
          create: {
            allowEmail: true,
            allowSms: true,
            allowMarketing: input.marketingConsent || false,
          },
        },
      },
      include: {
        demographics: true,
        communicationPref: true,
      },
    });

    await writeAuditLog({
      userId,
      patientId: patient.id,
      action: 'PATIENT_CREATED',
      resourceType: 'patient_profile',
      resourceId: patient.id,
      ipAddress,
    });

    return patient;
  }

  /**
   * List Patients with pagination and search (name, email, phone).
   */
  static async getPatients(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [total, patients] = await Promise.all([
      prisma.patientProfile.count({ where }),
      prisma.patientProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastName: 'asc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      patients,
      meta: {
        page,
        perPage: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get complete Patient Chart by ID (Profile, Demographics, History, Allergies, Medications, Documents, Photos).
   */
  static async getPatientById(patientId: string) {
    const patient = await prisma.patientProfile.findFirst({
      where: { id: patientId, deletedAt: null },
      include: {
        demographics: true,
        medicalHistories: { where: { deletedAt: null } },
        allergies: { where: { deletedAt: null } },
        medications: { where: { deletedAt: null } },
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        photos: { where: { deletedAt: null }, orderBy: { takenAt: 'desc' } },
        communicationPref: true,
      },
    });

    if (!patient) {
      throw AppError.notFound('Patient');
    }

    return patient;
  }

  /**
   * Update Patient Profile details.
   */
  static async updatePatient(patientId: string, input: UpdatePatientInput, userId: string, ipAddress: string) {
    const existing = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Patient');

    const updated = await prisma.patientProfile.update({
      where: { id: patientId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gender: input.gender,
        medicalAlerts: input.medicalAlerts,
        marketingConsentAt: input.marketingConsent ? new Date() : undefined,
        nppAcknowledgedAt: input.nppAcknowledged ? new Date() : undefined,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'PATIENT_UPDATED',
      resourceType: 'patient_profile',
      resourceId: patientId,
      ipAddress,
    });

    return updated;
  }

  /**
   * Soft-delete Patient Profile (Hard delete strictly blocked).
   */
  static async softDeletePatient(patientId: string, userId: string, ipAddress: string) {
    const existing = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Patient');

    await prisma.patientProfile.update({
      where: { id: patientId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'PATIENT_SOFT_DELETED',
      resourceType: 'patient_profile',
      resourceId: patientId,
      ipAddress,
    });
  }

  /**
   * Upsert Patient Demographics.
   */
  static async upsertDemographics(patientId: string, input: DemographicsInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const demographics = await prisma.demographics.upsert({
      where: { patientId },
      update: {
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone,
        preferredLang: input.preferredLang,
        ethnicity: input.ethnicity,
        fitzpatrickType: input.fitzpatrickType,
        insuranceProvider: input.insuranceProvider,
        policyNumber: input.policyNumber,
        groupNumber: input.groupNumber,
        referralSource: input.referralSource,
      },
      create: {
        patientId,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        emergencyName: input.emergencyName,
        emergencyPhone: input.emergencyPhone,
        preferredLang: input.preferredLang || 'English',
        ethnicity: input.ethnicity,
        fitzpatrickType: input.fitzpatrickType,
        insuranceProvider: input.insuranceProvider,
        policyNumber: input.policyNumber,
        groupNumber: input.groupNumber,
        referralSource: input.referralSource,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'DEMOGRAPHICS_UPDATED',
      resourceType: 'demographics',
      resourceId: demographics.id,
      ipAddress,
    });

    return demographics;
  }

  /**
   * Add Medical History condition.
   */
  static async addMedicalHistory(patientId: string, input: MedicalHistoryInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const history = await prisma.medicalHistory.create({
      data: {
        patientId,
        condition: input.condition,
        status: input.status,
        diagnosedDate: input.diagnosedDate ? new Date(input.diagnosedDate) : undefined,
        notes: input.notes,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'MEDICAL_HISTORY_ADDED',
      resourceType: 'medical_history',
      resourceId: history.id,
      ipAddress,
    });

    return history;
  }

  /**
   * Add Patient Allergy.
   */
  static async addAllergy(patientId: string, input: AllergyInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const allergy = await prisma.allergy.create({
      data: {
        patientId,
        allergen: input.allergen,
        reaction: input.reaction,
        severity: input.severity,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'ALLERGY_ADDED',
      resourceType: 'allergy',
      resourceId: allergy.id,
      ipAddress,
    });

    return allergy;
  }

  /**
   * Add Patient Medication.
   */
  static async addMedication(patientId: string, input: MedicationInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const medication = await prisma.medication.create({
      data: {
        patientId,
        medicationName: input.medicationName,
        dosage: input.dosage,
        frequency: input.frequency,
        prescribingProvider: input.prescribingProvider,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'MEDICATION_ADDED',
      resourceType: 'medication',
      resourceId: medication.id,
      ipAddress,
    });

    return medication;
  }

  /**
   * Request Presigned S3 Upload URL for Patient Document.
   */
  static async requestDocumentUpload(patientId: string, input: DocumentUploadRequestInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const fileKey = generatePatientDocumentKey(patientId, input.fileName);
    const uploadUrl = await getPresignedUploadUrl(fileKey, input.mimeType);

    const documentRecord = await prisma.patientDocument.create({
      data: {
        patientId,
        documentType: input.documentType,
        fileKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        uploadedBy: userId,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'DOCUMENT_UPLOAD_INITIATED',
      resourceType: 'patient_document',
      resourceId: documentRecord.id,
      ipAddress,
    });

    return {
      documentId: documentRecord.id,
      fileKey,
      uploadUrl,
    };
  }

  /**
   * Request Presigned S3 Upload URL for Patient Photo.
   */
  static async requestPhotoUpload(patientId: string, input: PhotoUploadRequestInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const fileKey = generatePatientPhotoKey(patientId, input.encounterId || 'general', input.fileName);
    const uploadUrl = await getPresignedUploadUrl(fileKey, input.mimeType);

    const photoRecord = await prisma.patientPhoto.create({
      data: {
        patientId,
        encounterId: input.encounterId || undefined,
        photoType: input.photoType,
        fileKey,
        bodyArea: input.bodyArea,
        notes: input.notes,
        takenBy: userId,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'PHOTO_UPLOAD_INITIATED',
      resourceType: 'patient_photo',
      resourceId: photoRecord.id,
      ipAddress,
    });

    return {
      photoId: photoRecord.id,
      fileKey,
      uploadUrl,
    };
  }

  /**
   * Get Presigned Download URL for a Patient Document or Photo.
   */
  static async getDocumentDownloadUrl(documentId: string, userId: string, ipAddress: string) {
    const doc = await prisma.patientDocument.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!doc) throw AppError.notFound('Document');

    const downloadUrl = await getPresignedDownloadUrl(doc.fileKey);

    await writeAuditLog({
      userId,
      patientId: doc.patientId,
      action: 'DOCUMENT_DOWNLOADED',
      resourceType: 'patient_document',
      resourceId: doc.id,
      ipAddress,
      newValue: { fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize, documentType: doc.documentType },
    });

    return { downloadUrl, fileName: doc.fileName };
  }

  /**
   * Upsert Communication Preferences.
   */
  static async upsertCommPref(patientId: string, input: CommPrefInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const pref = await prisma.communicationPreference.upsert({
      where: { patientId },
      update: {
        allowEmail: input.allowEmail,
        allowSms: input.allowSms,
        allowMarketing: input.allowMarketing,
      },
      create: {
        patientId,
        allowEmail: input.allowEmail,
        allowSms: input.allowSms,
        allowMarketing: input.allowMarketing,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'COMM_PREF_UPDATED',
      resourceType: 'communication_preference',
      resourceId: pref.id,
      ipAddress,
    });

    return pref;
  }

  /**
   * Record Public Marketing Consent (Booking or Footer Signup).
   */
  static async recordPublicMarketingConsent(input: PublicMarketingConsentInput, ipAddress: string) {
    let patient = await prisma.patientProfile.findFirst({
      where: { email: input.email, deletedAt: null },
    });

    if (patient) {
      if (input.marketingConsent && !patient.marketingConsentAt) {
        patient = await prisma.patientProfile.update({
          where: { id: patient.id },
          data: { marketingConsentAt: new Date() },
        });
      }

      const pref = await prisma.communicationPreference.upsert({
        where: { patientId: patient.id },
        update: { allowMarketing: input.marketingConsent },
        create: { patientId: patient.id, allowEmail: true, allowSms: true, allowMarketing: input.marketingConsent },
      });

      await writeAuditLog({
        userId: patient.userId || 'system',
        patientId: patient.id,
        action: input.marketingConsent ? 'MARKETING_CONSENT_GRANTED' : 'MARKETING_CONSENT_WITHDRAWN',
        resourceType: 'communication_preference',
        resourceId: pref.id,
        ipAddress,
      });

      return {
        success: true,
        patientId: patient.id,
        token: signMarketingUnsubscribeToken(patient.id, patient.email),
      };
    }

    // New subscriber / non-patient
    patient = await prisma.patientProfile.create({
      data: {
        firstName: input.firstName || 'Subscriber',
        lastName: input.lastName || 'Guest',
        email: input.email,
        marketingConsentAt: input.marketingConsent ? new Date() : undefined,
        communicationPref: {
          create: {
            allowEmail: true,
            allowSms: true,
            allowMarketing: input.marketingConsent,
          },
        },
      },
    });

    await writeAuditLog({
      userId: 'public',
      patientId: patient.id,
      action: 'MARKETING_CONSENT_GRANTED',
      resourceType: 'communication_preference',
      resourceId: patient.id,
      ipAddress,
    });

    return {
      success: true,
      patientId: patient.id,
      token: signMarketingUnsubscribeToken(patient.id, patient.email),
    };
  }

  /**
   * Verify Public Unsubscribe Token.
   */
  static async verifyUnsubscribeToken(token: string) {
    try {
      const decoded = verifyMarketingUnsubscribeToken(token);
      const patient = await prisma.patientProfile.findFirst({
        where: {
          OR: [{ id: decoded.sub }, { email: decoded.email }],
          deletedAt: null,
        },
        include: { communicationPref: true },
      });

      if (!patient) {
        return { valid: false, reason: 'Patient not found' };
      }

      const alreadyUnsubscribed = patient.communicationPref ? !patient.communicationPref.allowMarketing : false;
      return {
        valid: true,
        email: patient.email,
        alreadyUnsubscribed,
      };
    } catch (err: any) {
      return { valid: false, reason: err?.message || 'Invalid token' };
    }
  }

  /**
   * Execute Public Unsubscribe.
   */
  static async executePublicUnsubscribe(token: string, ipAddress: string) {
    const decoded = verifyMarketingUnsubscribeToken(token);

    const patient = await prisma.patientProfile.findFirst({
      where: {
        OR: [{ id: decoded.sub }, { email: decoded.email }],
        deletedAt: null,
      },
    });

    if (!patient) throw AppError.notFound('Patient');

    const pref = await prisma.communicationPreference.upsert({
      where: { patientId: patient.id },
      update: { allowMarketing: false },
      create: { patientId: patient.id, allowEmail: true, allowSms: true, allowMarketing: false },
    });

    await writeAuditLog({
      userId: patient.userId || 'public',
      patientId: patient.id,
      action: 'MARKETING_CONSENT_WITHDRAWN',
      resourceType: 'communication_preference',
      resourceId: pref.id,
      ipAddress,
    });


    return { success: true, alreadyUnsubscribed: true };
  }


  /**
   * Submit CMIA PHI Deletion Request (California Health & Safety Code §123145 — 7-Year Rule).
   */
  static async submitCmiaDeletionRequest(patientId: string, input: CmiaDeletionRequestInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    // Calculate age of patient record
    const accountCreatedDate = patient.createdAt;
    const now = new Date();
    const retentionYears = (now.getTime() - accountCreatedDate.getTime()) / (1000 * 3600 * 24 * 365.25);

    const retentionPassed = retentionYears >= CMIA_RETENTION_YEARS;
    const status = retentionPassed ? 'approved_for_deletion' : 'retention_period_active';

    const request = await prisma.phiDeletionRequest.create({
      data: {
        patientId,
        requestedBy: userId,
        status,
        reason: input.reason,
        retentionPassed,
      },
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'CMIA_DELETION_REQUESTED',
      resourceType: 'phi_deletion_request',
      resourceId: request.id,
      ipAddress,
      newValue: { retentionPassed, retentionYears: retentionYears.toFixed(2), status },
    });

    return {
      requestId: request.id,
      status,
      retentionPassed,
      retentionYears: parseFloat(retentionYears.toFixed(2)),
      mandatoryRetentionYears: CMIA_RETENTION_YEARS,
      message: retentionPassed
        ? 'CMIA retention period passed (7+ years). Request approved for processing.'
        : `CMIA California Health & Safety Code §123145 requires 7-year record retention. Account is ${retentionYears.toFixed(1)} years old. Record retained until 7-year mark.`,
    };
  }

  /**
   * Resolve Patient Profile by User ID (strictly isolated to authenticated user).
   */
  static async getPatientProfileByUserId(userId: string) {
    const profile = await prisma.patientProfile.findFirst({
      where: { userId, deletedAt: null },
      include: {
        communicationPref: true,
        demographics: true,
        medicalHistories: true,
        allergies: true,
        medications: true,
      },
    });

    if (!profile) {
      throw AppError.notFound('No patient profile linked to this user account');
    }

    return profile;
  }

  /**
   * Get appointments for the authenticated patient.
   */
  static async getMyAppointments(userId: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    const appointments = await prisma.appointment.findMany({
      where: { patientId: profile.id, deletedAt: null },
      include: {
        appointmentServices: {
          include: { service: true },
        },
        location: true,
        staff: true,
      },
      orderBy: { startAt: 'desc' },
    });

    return appointments;
  }

  /**
   * Get consent records for the authenticated patient.
   */
  static async getMyConsents(userId: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    const consents = await prisma.consentAssignment.findMany({
      where: { patientId: profile.id },
      include: {
        template: { select: { id: true, name: true, version: true } },
        signatures: {
          select: { id: true, signedAt: true, clientEmail: true, ipAddress: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return consents;
  }

  /**
   * Complete Medical Record Export (HIPAA §164.524 Right of Access).
   * Aggregates authorized ePHI, records PhiExportAudit in Railway MySQL, and returns sanitized DTO.
   */
  static async exportMedicalRecord(
    userId: string,
    rawSections: string | undefined,
    ipAddress: string,
    userAgent?: string
  ) {
    const profile = await this.getPatientProfileByUserId(userId);

    const ALLOWED_SECTIONS = new Set(['clinicalNotes', 'consentSignatures', 'appointments', 'billingReceipts']);
    const requestedSections = rawSections
      ? rawSections.split(',').map((s) => s.trim()).filter((s) => ALLOWED_SECTIONS.has(s))
      : ['clinicalNotes', 'consentSignatures', 'appointments', 'billingReceipts'];

    const includeSection = (name: string) => requestedSections.length === 0 || requestedSections.includes(name);

    let clinicalNotes: any[] = [];
    let consentSignatures: any[] = [];
    let appointments: any[] = [];
    let billingReceipts: any[] = [];

    const promises: Promise<void>[] = [];

    if (includeSection('clinicalNotes')) {
      promises.push(
        (async () => {
          const notes = await prisma.soapNote.findMany({
            where: {
              patientId: profile.id,
              status: { in: ['signed', 'cosigned', 'locked'] },
              deletedAt: null,
            },
            include: {
              author: { select: { id: true, fullName: true } },
              encounter: { select: { id: true, encounterType: true, encounterDate: true } },
              appointment: {
                include: {
                  appointmentServices: {
                    include: { service: { select: { name: true } } },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          clinicalNotes = notes.map((n) => ({
            id: n.id,
            created_at: n.createdAt.toISOString(),
            category: n.noteType || 'Clinical Encounter',
            service_name: n.appointment?.appointmentServices.map((as) => as.service.name).join(', ') || n.encounter?.encounterType || 'Medical Service',
            provider_name: n.author?.fullName || 'Clinical Provider',
            note_body: n.objective || n.subjective || n.assessment || n.plan || 'Clinical note recorded',
            status: n.status,
          }));
        })()
      );
    }

    if (includeSection('consentSignatures')) {
      promises.push(
        (async () => {
          const signatures = await prisma.consentSignature.findMany({
            where: {
              OR: [{ patientId: profile.id }, { assignment: { patientId: profile.id } }],
              signedAt: { not: null },
            },
            include: {
              assignment: {
                include: {
                  template: { select: { name: true, version: true } },
                },
              },
            },
            orderBy: { signedAt: 'desc' },
          });

          consentSignatures = signatures.map((s) => ({
            id: s.id,
            signed_at: s.signedAt ? s.signedAt.toISOString() : s.createdAt.toISOString(),
            signed_full_name: profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : 'Patient',
            decision: 'agreed',
            form_name: s.assignment?.template?.name || 'Consent Form',
            form_version: s.assignment?.template?.version || 1,
          }));
        })()
      );
    }

    if (includeSection('appointments')) {
      promises.push(
        (async () => {
          const appts = await prisma.appointment.findMany({
            where: { patientId: profile.id, deletedAt: null },
            include: {
              appointmentServices: {
                include: { service: { select: { name: true } } },
              },
              staff: { select: { id: true, fullName: true } },
            },
            orderBy: { startAt: 'desc' },
          });

          appointments = appts.map((a) => ({
            id: a.id,
            start_at: a.startAt.toISOString(),
            end_at: a.endAt.toISOString(),
            service_name: a.appointmentServices.map((as) => as.service.name).join(', ') || 'Appointment',
            provider_name: a.staff?.fullName || 'Provider',
            status: a.status,
          }));
        })()
      );
    }


    if (includeSection('billingReceipts')) {
      promises.push(
        (async () => {
          const invoices = await prisma.invoice.findMany({
            where: { patientId: profile.id, deletedAt: null },
            include: {
              payments: { select: { amountCents: true, paymentMethod: true, status: true, createdAt: true } },
            },
            orderBy: { createdAt: 'desc' },
          });

          billingReceipts = invoices.map((inv) => ({
            id: inv.id,
            paid_at: inv.payments[0]?.createdAt ? inv.payments[0].createdAt.toISOString() : inv.createdAt.toISOString(),
            total_cents: inv.totalCents,
            status: inv.status,
            payment_method: inv.payments[0]?.paymentMethod || 'card',
          }));
        })()
      );
    }

    await Promise.all(promises);

    const recordCount = 1 + clinicalNotes.length + consentSignatures.length + appointments.length + billingReceipts.length;

    // Fail-Closed Audit Logging: Create PhiExportAudit record in DB BEFORE returning ePHI
    await prisma.phiExportAudit.create({
      data: {
        userId,
        patientId: profile.id,
        exportType: 'patient_complete_medical_record',
        recordCount,
        ipAddress,
        userAgent: userAgent || null,
        fileKey: null,
      },
    });

    await writeAuditLog({
      userId,
      patientId: profile.id,
      action: 'PHI_EXPORTED',
      resourceType: 'patient_profile',
      resourceId: profile.id,
      ipAddress,
    });

    return {
      exportedAt: new Date().toISOString(),
      recordCount,
      patientProfile: {
        first_name: profile.firstName,
        last_name: profile.lastName,
        email: profile.email,
        phone: profile.phone,
        dob: profile.dateOfBirth ? profile.dateOfBirth.toISOString().split('T')[0] : null,
        gender: profile.gender,
        medical_alerts: profile.medicalAlerts,
        demographics: profile.demographics,
        medical_histories: profile.medicalHistories,
        allergies: profile.allergies,
        medications: profile.medications,
      },
      clinicalNotes,
      consentSignatures,
      appointments,
      billingReceipts,
    };
  }

  /**
   * Submit Patient Record Amendment Request (HIPAA §164.526).
   */
  static async createAmendmentRequest(userId: string, input: CreateAmendmentRequestInput, ipAddress: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    if (input.noteId) {
      const note = await prisma.soapNote.findFirst({
        where: { id: input.noteId, patientId: profile.id, deletedAt: null },
      });
      if (!note) {
        throw AppError.notFound('Target clinical note not found or access denied');
      }
    }

    const request = await prisma.patientAmendmentRequest.create({
      data: {
        patientId: profile.id,
        requestedByUserId: userId,
        recordCategory: input.recordCategory,
        noteId: input.noteId || null,
        currentText: input.currentText || null,
        requestedCorrection: input.requestedCorrection,
        rationale: input.rationale,
        status: 'pending',
      },
    });

    await writeAuditLog({
      userId,
      patientId: profile.id,
      action: 'AMENDMENT_REQUEST_SUBMITTED',
      resourceType: 'patient_amendment_request',
      resourceId: request.id,
      ipAddress,
    });

    return request;
  }

  /**
   * Get Amendment Requests submitted by the authenticated patient.
   */
  static async getMyAmendmentRequests(userId: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    const requests = await prisma.patientAmendmentRequest.findMany({
      where: { patientId: profile.id },
      include: {
        reviewer: { select: { id: true, fullName: true, title: true } },
        note: { select: { id: true, createdAt: true, status: true, noteType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  }

  // ==========================================
  // ---- NPP ACKNOWLEDGMENT (R-36) ----
  // ==========================================

  /**
   * Get the current NPP acknowledgment status for the authenticated patient.
   */
  static async getNppStatus(userId: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    return {
      patientId: profile.id,
      acknowledged: !!profile.nppAcknowledgedAt,
      acknowledgedAt: profile.nppAcknowledgedAt || null,
      nppVersion: profile.nppVersion || null,
    };
  }

  /**
   * Acknowledge NPP for the authenticated patient.
   * Idempotent: if same version already acknowledged, returns existing acknowledgment.
   * If new version, updates the acknowledgment.
   */
  static async acknowledgeNpp(userId: string, nppVersion: string, ipAddress: string) {
    const profile = await this.getPatientProfileByUserId(userId);

    // Idempotent: if same version already acknowledged, return existing
    if (profile.nppAcknowledgedAt && profile.nppVersion === nppVersion) {
      return {
        patientId: profile.id,
        acknowledged: true,
        acknowledgedAt: profile.nppAcknowledgedAt,
        nppVersion: profile.nppVersion,
        alreadyAcknowledged: true,
      };
    }

    const now = new Date();

    const updated = await prisma.patientProfile.update({
      where: { id: profile.id },
      data: {
        nppAcknowledgedAt: now,
        nppVersion,
        nppIpAddress: ipAddress,
      },
      select: {
        id: true,
        nppAcknowledgedAt: true,
        nppVersion: true,
      },
    });

    await writeAuditLog({
      userId,
      patientId: profile.id,
      action: 'NPP_ACKNOWLEDGED',
      resourceType: 'patient_profile',
      resourceId: profile.id,
      ipAddress,
      newValue: { nppVersion, acknowledgedAt: now.toISOString() },
    });

    return {
      patientId: updated.id,
      acknowledged: true,
      acknowledgedAt: updated.nppAcknowledgedAt,
      nppVersion: updated.nppVersion,
      alreadyAcknowledged: false,
    };
  }
}



