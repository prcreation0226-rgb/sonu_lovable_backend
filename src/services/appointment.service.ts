// Radiantilyk EMR — Appointment & Scheduling Service
// Manages clinic appointment lifecycle, provider double-booking checks, calendar views,
// status state machine transitions, online booking tokens, time off, and waitlists.
//
// Status State Machine:
// PENDING ──► CONFIRMED ──► CHECKED_IN ──► IN_PROGRESS ──► COMPLETED
//    │           │               │
//    └──► CANCELLED / NO_SHOW / RESCHEDULED

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { AppointmentStatus, AppointmentSource } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  TransitionStatusInput,
  RescheduleAppointmentInput,
  CancelAppointmentInput,
  PublicBookingRequestInput,
  StaffTimeOffInput,
  WaitlistInput,
} from '../schemas/appointment.schema';

// Allowed State Machine Transitions
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.RESCHEDULED],
  [AppointmentStatus.CHECKED_IN]: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  [AppointmentStatus.IN_PROGRESS]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.COMPLETED]: [], // Terminal state
  [AppointmentStatus.CANCELLED]: [], // Terminal state
  [AppointmentStatus.NO_SHOW]: [],   // Terminal state
  [AppointmentStatus.RESCHEDULED]: [],// Terminal state
};

export class AppointmentService {
  /**
   * Get pending appointments count.
   */
  static async getPendingCount() {
    const count = await prisma.appointment.count({
      where: { status: 'PENDING', deletedAt: null },
    });
    return { count };
  }

  /**
   * Create a new Appointment (with double-booking overlap check).
   */
  static async createAppointment(input: CreateAppointmentInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const staff = await prisma.staffProfile.findFirst({ where: { id: input.staffId, deletedAt: null } });
    if (!staff) throw AppError.notFound('Staff Profile');

    const location = await prisma.location.findFirst({ where: { id: input.locationId, deletedAt: null } });
    if (!location) throw AppError.notFound('Location');

    // Fetch services to calculate total duration and total cost
    const services = await prisma.service.findMany({
      where: { id: { in: input.serviceIds }, deletedAt: null },
    });

    if (services.length !== input.serviceIds.length) {
      throw AppError.badRequest('One or more selected services are invalid');
    }

    const totalDurationMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);

    const startAt = new Date(input.startAt);
    const endAt = input.endAt ? new Date(input.endAt) : new Date(startAt.getTime() + totalDurationMinutes * 60 * 1000);

    // Double-Booking Overlap Check
    const overlapping = await prisma.appointment.findFirst({
      where: {
        staffId: input.staffId,
        deletedAt: null,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.RESCHEDULED] },
        OR: [
          { startAt: { lt: endAt }, endAt: { gt: startAt } },
        ],
      },
    });

    if (overlapping) {
      throw AppError.conflict('Provider already has an active appointment during this time slot');
    }

    // Create Appointment with nested services
    const appointment = await prisma.appointment.create({
      data: {
        patientId: input.patientId,
        staffId: input.staffId,
        locationId: input.locationId,
        startAt,
        endAt,
        status: AppointmentStatus.PENDING,
        source: input.source || AppointmentSource.STAFF,
        notes: input.notes,
        internalNotes: input.internalNotes,
        bookingToken: `BKR-${uuidv4().substring(0, 8).toUpperCase()}`,
        appointmentServices: {
          create: services.map((s) => ({
            serviceId: s.id,
            priceCents: s.priceCents,
            durationMinutes: s.durationMinutes,
          })),
        },
        statusHistories: {
          create: {
            newStatus: AppointmentStatus.PENDING,
            changedBy: userId,
            reason: 'Appointment created',
          },
        },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        staff: { select: { id: true, fullName: true, title: true } },
        location: { select: { id: true, name: true } },
        appointmentServices: { include: { service: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'APPOINTMENT_CREATED',
      resourceType: 'appointment',
      resourceId: appointment.id,
      ipAddress,
      newValue: { startAt, endAt, staffId: input.staffId, status: appointment.status },
    });

    return appointment;
  }

  /**
   * Get Appointments for Calendar / List View with filtering.
   */
  static async getAppointments(filters: {
    locationId?: string;
    staffId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    status?: AppointmentStatus;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.status) where.status = filters.status;

    if (filters.startDate || filters.endDate) {
      where.startAt = {};
      if (filters.startDate) where.startAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.startAt.lte = new Date(filters.endDate);
    }

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startAt: 'asc' },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          staff: { select: { id: true, fullName: true, title: true, color: true } },
          location: { select: { id: true, name: true } },
          appointmentServices: { include: { service: true } },
        },
      }),
    ]);

    return {
      appointments,
      meta: {
        page,
        perPage: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Appointment by ID (including status history).
   */
  static async getAppointmentById(id: string) {
    const appt = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, medicalAlerts: true } },
        staff: { select: { id: true, fullName: true, title: true, color: true } },
        location: { select: { id: true, name: true, phone: true } },
        appointmentServices: { include: { service: true } },
        statusHistories: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!appt) throw AppError.notFound('Appointment');
    return appt;
  }

  /**
   * Transition Appointment Status (Enforces Allowed State Machine Transitions).
   */
  static async transitionStatus(id: string, input: TransitionStatusInput, userId: string, ipAddress: string) {
    const appt = await prisma.appointment.findFirst({ where: { id, deletedAt: null } });
    if (!appt) throw AppError.notFound('Appointment');

    const currentStatus = appt.status;
    const newStatus = input.status;

    // Check state machine validity
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed.includes(newStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowed.join(', ') || 'None'}`
      );
    }

    const updateData: any = { status: newStatus };
    const now = new Date();

    if (newStatus === AppointmentStatus.CHECKED_IN) updateData.checkedInAt = now;
    if (newStatus === AppointmentStatus.IN_PROGRESS) updateData.startedAt = now;
    if (newStatus === AppointmentStatus.COMPLETED) updateData.completedAt = now;

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        ...updateData,
        statusHistories: {
          create: {
            previousStatus: currentStatus,
            newStatus,
            changedBy: userId,
            reason: input.reason || undefined,
          },
        },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        staff: { select: { id: true, fullName: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: appt.patientId,
      action: 'APPOINTMENT_STATUS_CHANGED',
      resourceType: 'appointment',
      resourceId: id,
      ipAddress,
      oldValue: { status: currentStatus },
      newValue: { status: newStatus, reason: input.reason },
    });

    return updated;
  }

  /**
   * Reschedule Appointment.
   */
  static async rescheduleAppointment(id: string, input: RescheduleAppointmentInput, userId: string, ipAddress: string) {
    const appt = await prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: { appointmentServices: true },
    });
    if (!appt) throw AppError.notFound('Appointment');

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(appt.status)) {
      throw AppError.badRequest(`Cannot reschedule appointment with status '${appt.status}'`);
    }

    const newStartAt = new Date(input.startAt);
    const durationMs = appt.endAt.getTime() - appt.startAt.getTime();
    const newEndAt = input.endAt ? new Date(input.endAt) : new Date(newStartAt.getTime() + durationMs);

    // Double-booking check
    const overlapping = await prisma.appointment.findFirst({
      where: {
        id: { not: id },
        staffId: appt.staffId,
        deletedAt: null,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.RESCHEDULED] },
        OR: [
          { startAt: { lt: newEndAt }, endAt: { gt: newStartAt } },
        ],
      },
    });

    if (overlapping) {
      throw AppError.conflict('Provider already has an active appointment during the requested time slot');
    }

    // Mark current appointment as RESCHEDULED
    await prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.RESCHEDULED,
        statusHistories: {
          create: {
            previousStatus: appt.status,
            newStatus: AppointmentStatus.RESCHEDULED,
            changedBy: userId,
            reason: input.reason || 'Rescheduled to new slot',
          },
        },
      },
    });

    // Create new appointment linked via rescheduledFromId
    const newAppt = await prisma.appointment.create({
      data: {
        patientId: appt.patientId,
        staffId: appt.staffId,
        locationId: appt.locationId,
        startAt: newStartAt,
        endAt: newEndAt,
        status: AppointmentStatus.CONFIRMED,
        source: appt.source,
        notes: appt.notes,
        internalNotes: appt.internalNotes,
        rescheduledFromId: appt.id,
        bookingToken: `BKR-${uuidv4().substring(0, 8).toUpperCase()}`,
        appointmentServices: {
          create: appt.appointmentServices.map((s) => ({
            serviceId: s.serviceId,
            priceCents: s.priceCents,
            durationMinutes: s.durationMinutes,
          })),
        },
        statusHistories: {
          create: {
            newStatus: AppointmentStatus.CONFIRMED,
            changedBy: userId,
            reason: `Rescheduled from appointment #${id}`,
          },
        },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        staff: { select: { id: true, fullName: true } },
        appointmentServices: { include: { service: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: appt.patientId,
      action: 'APPOINTMENT_RESCHEDULED',
      resourceType: 'appointment',
      resourceId: newAppt.id,
      ipAddress,
      oldValue: { originalAppointmentId: id, oldStartAt: appt.startAt },
      newValue: { newAppointmentId: newAppt.id, newStartAt },
    });

    return newAppt;
  }

  /**
   * Cancel Appointment.
   */
  static async cancelAppointment(id: string, input: CancelAppointmentInput, userId: string, ipAddress: string) {
    const appt = await prisma.appointment.findFirst({ where: { id, deletedAt: null } });
    if (!appt) throw AppError.notFound('Appointment');

    if (appt.status === AppointmentStatus.COMPLETED) {
      throw AppError.badRequest('Completed appointments cannot be cancelled');
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: input.cancellationReason,
        cancelledAt: new Date(),
        statusHistories: {
          create: {
            previousStatus: appt.status,
            newStatus: AppointmentStatus.CANCELLED,
            changedBy: userId,
            reason: input.cancellationReason,
          },
        },
      },
    });

    await writeAuditLog({
      userId,
      patientId: appt.patientId,
      action: 'APPOINTMENT_CANCELLED',
      resourceType: 'appointment',
      resourceId: id,
      ipAddress,
      oldValue: { status: appt.status },
      newValue: { status: AppointmentStatus.CANCELLED, reason: input.cancellationReason },
    });

    return updated;
  }

  /**
   * Create Public Online Booking Request (Unauthenticated).
   */
  static async createPublicBookingRequest(input: PublicBookingRequestInput, ipAddress: string) {
    const service = await prisma.service.findFirst({ where: { id: input.serviceId, deletedAt: null } });
    if (!service) throw AppError.notFound('Service');

    // Find or create patient record by email
    let patient = await prisma.patientProfile.findFirst({ where: { email: input.email, deletedAt: null } });
    if (!patient) {
      patient = await prisma.patientProfile.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          communicationPref: { create: { allowEmail: true, allowSms: true } },
        },
      });
    }

    const startAt = new Date(input.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000);
    const bookingToken = `BKR-${uuidv4().substring(0, 8).toUpperCase()}`;

    const appt = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        staffId: input.staffId,
        locationId: input.locationId,
        startAt,
        endAt,
        status: AppointmentStatus.PENDING,
        source: AppointmentSource.ONLINE,
        notes: input.notes,
        bookingToken,
        appointmentServices: {
          create: [{
            serviceId: service.id,
            priceCents: service.priceCents,
            durationMinutes: service.durationMinutes,
          }],
        },
      },
    });

    return {
      bookingToken,
      appointmentId: appt.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      serviceName: service.name,
      startAt,
      endAt,
      status: appt.status,
    };
  }

  /**
   * Request Staff Time Off.
   */
  static async createStaffTimeOff(staffId: string, input: StaffTimeOffInput, userId: string, ipAddress: string) {
    const timeOff = await prisma.staffTimeOff.create({
      data: {
        staffId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        reason: input.reason,
        status: 'pending',
      },
    });

    await writeAuditLog({
      userId,
      action: 'STAFF_TIMEOFF_REQUESTED',
      resourceType: 'staff_time_off',
      resourceId: timeOff.id,
      ipAddress,
      newValue: input,
    });

    return timeOff;
  }

  /**
   * Add Entry to Waitlist.
   */
  static async createWaitlistEntry(input: WaitlistInput, userId: string, ipAddress: string) {
    const entry = await prisma.waitlistEntry.create({
      data: {
        patientId: input.patientId,
        serviceId: input.serviceId || undefined,
        locationId: input.locationId || undefined,
        preferredDays: input.preferredDays,
        notes: input.notes,
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'WAITLIST_ENTRY_CREATED',
      resourceType: 'waitlist_entry',
      resourceId: entry.id,
      ipAddress,
    });

    return entry;
  }
}
