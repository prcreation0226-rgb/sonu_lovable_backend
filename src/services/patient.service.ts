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
  CmiaDeletionRequestInput,
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
}
