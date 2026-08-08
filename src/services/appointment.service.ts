
// Radiantilyk EMR — Appointment & Scheduling Service
// Manages clinic appointment lifecycle, provider double-booking checks, calendar views,
// status state machine transitions, online booking tokens, time off, and waitlists.
//
// Status State Machine:
// PENDING ──► CONFIRMED ──► CHECKED_IN ──► IN_PROGRESS ──► COMPLETED
//    │           │               │
//    └──► CANCELLED / NO_SHOW / RESCHEDULED

import crypto from 'crypto';
import bcrypt from 'bcrypt';
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

    // Atomic Double-Booking Overlap Check & Creation inside Transaction
    const appointment = await prisma.$transaction(async (tx) => {
      const overlapping: any[] = await tx.$queryRaw`
        SELECT id FROM appointments 
        WHERE staff_id = ${input.staffId}
          AND deleted_at IS NULL
          AND status NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
          AND start_at < ${endAt}
          AND end_at > ${startAt}
        FOR UPDATE
      `;

      if (overlapping && overlapping.length > 0) {
        throw AppError.conflict('Selected time is no longer available.');
      }

      return await tx.appointment.create({
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

    if (filters.locationId && filters.locationId !== 'all') where.locationId = filters.locationId;
    if (filters.staffId && filters.staffId !== 'all') where.staffId = filters.staffId;
    if (filters.patientId) where.patientId = filters.patientId;

    if (filters.status) {
      const rawStatus = String(filters.status).trim().toUpperCase();
      const statusMap: Record<string, AppointmentStatus> = {
        PENDING: AppointmentStatus.PENDING,
        APPROVED: AppointmentStatus.CONFIRMED,
        CONFIRMED: AppointmentStatus.CONFIRMED,
        CHECKED_IN: AppointmentStatus.CHECKED_IN,
        ARRIVED: AppointmentStatus.CHECKED_IN,
        IN_PROGRESS: AppointmentStatus.IN_PROGRESS,
        COMPLETED: AppointmentStatus.COMPLETED,
        CANCELLED: AppointmentStatus.CANCELLED,
        DENIED: AppointmentStatus.CANCELLED,
        NO_SHOW: AppointmentStatus.NO_SHOW,
        RESCHEDULED: AppointmentStatus.RESCHEDULED,
      };

      if (statusMap[rawStatus]) {
        where.status = statusMap[rawStatus];
      } else if (Object.values(AppointmentStatus).includes(rawStatus as any)) {
        where.status = rawStatus as AppointmentStatus;
      }
    }

    if (filters.startDate || filters.endDate) {
      const startAtObj: any = {};
      if (filters.startDate) {
        const d = new Date(filters.startDate);
        if (!isNaN(d.getTime())) startAtObj.gte = d;
      }
      if (filters.endDate) {
        const d = new Date(filters.endDate);
        if (!isNaN(d.getTime())) startAtObj.lte = d;
      }
      if (Object.keys(startAtObj).length > 0) {
        where.startAt = startAtObj;
      }
    }

    let total = 0;
    let appointments: any[] = [];

    try {
      const [tCount, appts] = await Promise.all([
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
      total = tCount;
      appointments = appts;
    } catch (err: any) {
      // Handle orphan records (e.g. patient deleted directly in DB violating FK in Prisma result)
      if (err?.message?.includes('Inconsistent query result') || err?.code === 'P2023') {
        console.warn('Prisma patient relation inconsistency detected in getAppointments, falling back to safe query');
        total = await prisma.appointment.count({ where });
        const rawAppts = await prisma.appointment.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startAt: 'asc' },
          include: {
            staff: { select: { id: true, fullName: true, title: true, color: true } },
            location: { select: { id: true, name: true } },
            appointmentServices: { include: { service: true } },
          },
        });

        // Manually fetch patient profiles for valid patient IDs
        const patientIds = Array.from(new Set(rawAppts.map(a => a.patientId).filter(Boolean)));
        const patientProfiles = await prisma.patientProfile.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        });
        const patientMap = new Map(patientProfiles.map(p => [p.id, p]));

        appointments = rawAppts.map(a => ({
          ...a,
          patient: patientMap.get(a.patientId) || {
            id: a.patientId,
            firstName: 'Patient',
            lastName: '(Record Missing)',
            email: '',
            phone: '',
          },
        }));
      } else {
        throw err;
      }
    }

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
      throw AppError.conflict('Selected time is no longer available.');
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
   * Atomically persists Appointment, PatientProfile, and User account (if new).
   */
  static async createPublicBookingRequest(input: PublicBookingRequestInput, ipAddress: string) {
    const cleanEmail = input.email.trim().toLowerCase();

    const service = await prisma.service.findFirst({ where: { id: input.serviceId, deletedAt: null } });
    if (!service) throw AppError.notFound('Service');

    // 1. Resolve staffId with fallback
    let staffId = input.staffId || undefined;
    let staff = staffId ? await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } }) : null;
    if (!staff) {
      staff = await prisma.staffProfile.findFirst({ where: { deletedAt: null, isActive: true } });
      if (!staff) staff = await prisma.staffProfile.findFirst({ where: { deletedAt: null } });
      if (!staff) throw AppError.notFound('Staff Profile');
      staffId = staff.id;
    }

    // 2. Resolve locationId with fallback
    let locationId = input.locationId || undefined;
    let location = locationId ? await prisma.location.findFirst({ where: { id: locationId, deletedAt: null } }) : null;
    if (!location) {
      location = await prisma.location.findFirst({ where: { deletedAt: null, isActive: true } });
      if (!location) location = await prisma.location.findFirst({ where: { deletedAt: null } });
      if (!location) throw AppError.notFound('Location');
      locationId = location.id;
    }

    const startAt = new Date(input.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000);
    const bookingToken = `BKR-${uuidv4().substring(0, 8).toUpperCase()}`;

    let rawTempPassword: string | undefined;
    let hashedPassword = '';
    let existingAccount = false;

    // Retry wrapper: if a concurrent request causes P2002 inside the transaction
    // (which invalidates the MySQL/InnoDB transaction), retry once — on the second
    // attempt the existing user/profile will be found by the initial queries.
    const MAX_RETRIES = 2;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Reset mutable state on each attempt
        existingAccount = false;
        rawTempPassword = `RKA-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`;
        hashedPassword = await bcrypt.hash(rawTempPassword, 10);

        const result = await prisma.$transaction(async (tx) => {
          // 1. Find existing patient profile by normalized email
          let patient = await tx.patientProfile.findFirst({
            where: { email: cleanEmail, deletedAt: null },
          });

          // 2. Check if a User account exists for this email
          const existingUser = await tx.user.findFirst({
            where: { email: cleanEmail, deletedAt: null },
          });

          if (existingUser) {
            existingAccount = true;
            rawTempPassword = undefined;
            // Ensure patient profile is linked to existing user
            if (patient) {
              if (!patient.userId) {
                patient = await tx.patientProfile.update({
                  where: { id: patient.id },
                  data: { userId: existingUser.id },
                });
              }
            } else {
              patient = await tx.patientProfile.create({
                data: {
                  userId: existingUser.id,
                  firstName: input.firstName,
                  lastName: input.lastName,
                  email: cleanEmail,
                  phone: input.phone,
                  communicationPref: { create: { allowEmail: true, allowSms: true } },
                },
              });
            }
          } else {
            // No User exists — create new user with temporary password
            existingAccount = false;

            // Resolve patient role from DB (RBAC check)
            const patientRole = await tx.role.findFirst({ where: { name: 'patient' } });
            if (!patientRole) {
              throw new AppError('Patient role is not configured in the system', 500);
            }

            // Create User with mustChangePassword = true
            const newUser = await tx.user.create({
              data: {
                email: cleanEmail,
                passwordHash: hashedPassword,
                isActive: true,
                mustChangePassword: true,
              },
            });

            await tx.userRole.create({
              data: {
                userId: newUser.id,
                roleId: patientRole.id,
              },
            });

            // Link or create PatientProfile
            if (patient) {
              patient = await tx.patientProfile.update({
                where: { id: patient.id },
                data: { userId: newUser.id },
              });
            } else {
              patient = await tx.patientProfile.create({
                data: {
                  userId: newUser.id,
                  firstName: input.firstName,
                  lastName: input.lastName,
                  email: cleanEmail,
                  phone: input.phone,
                  communicationPref: { create: { allowEmail: true, allowSms: true } },
                },
              });
            }
          }

          // 2b. Safely resolve locationId and staffId (fallback to first available or create default if missing)
          let targetLocation = input.locationId
            ? await tx.location.findFirst({ where: { id: input.locationId, deletedAt: null } })
            : null;
          if (!targetLocation) {
            targetLocation = await tx.location.findFirst({ where: { isActive: true, deletedAt: null } });
          }
          if (!targetLocation) {
            targetLocation = await tx.location.findFirst({ where: { deletedAt: null } });
          }
          if (!targetLocation) {
            targetLocation = await tx.location.create({
              data: {
                name: 'Radiantilyk Main Clinic',
                address: '100 Medical Center Way',
                city: 'Beverly Hills',
                state: 'CA',
                zipCode: '90210',
                phone: '(555) 019-2831',
                timezone: 'America/Los_Angeles',
                isActive: true,
              },
            });
          }

          let targetStaff = input.staffId
            ? await tx.staffProfile.findFirst({ where: { id: input.staffId, deletedAt: null } })
            : null;
          if (!targetStaff) {
            targetStaff = await tx.staffProfile.findFirst({ where: { isActive: true, deletedAt: null } });
          }
          if (!targetStaff) {
            targetStaff = await tx.staffProfile.findFirst({ where: { deletedAt: null } });
          }
          if (!targetStaff) {
            let providerUser = await tx.user.findFirst({ where: { email: 'provider@radiantilyk.com' } });
            if (!providerUser) {
              const defaultRole = await tx.role.findFirst({ where: { name: 'rn_injector' } });
              providerUser = await tx.user.create({
                data: {
                  email: 'provider@radiantilyk.com',
                  passwordHash: await bcrypt.hash('Provider123!', 10),
                  isActive: true,
                  userRoles: defaultRole ? { create: { roleId: defaultRole.id } } : undefined,
                },
              });
            }
            targetStaff = await tx.staffProfile.create({
              data: {
                userId: providerUser.id,
                fullName: 'Nurse Practitioner Provider',
                title: 'Nurse Practitioner & Lead Injector',
                email: 'provider@radiantilyk.com',
                phone: '(555) 019-2832',
                isActive: true,
              },
            });
          }

          // 3. Atomic Double-Booking Overlap Recheck with FOR UPDATE Lock
          await tx.$queryRaw`SELECT id FROM staff_profiles WHERE id = ${targetStaff.id} FOR UPDATE`;

          const overlapping: any[] = await tx.$queryRaw`
            SELECT id FROM appointments 
            WHERE staff_id = ${targetStaff.id}
              AND deleted_at IS NULL
              AND status NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
              AND start_at < ${endAt}
              AND end_at > ${startAt}
            FOR UPDATE
          `;

          if (overlapping && overlapping.length > 0) {
            throw AppError.conflict('Selected time is no longer available.');
          }

          // 4. Create Appointment using real patientId (UUID)
          const appt = await tx.appointment.create({
            data: {
              patient: { connect: { id: patient.id } },
              location: { connect: { id: targetLocation.id } },
              staff: { connect: { id: targetStaff.id } },
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

          return { appt, patient };
        }, { maxWait: 10000, timeout: 20000 });

        return {
          bookingToken,
          appointmentId: result.appt.id,
          patientName: `${result.patient.firstName} ${result.patient.lastName}`,
          serviceName: service.name,
          startAt,
          endAt,
          status: result.appt.status,
          existingAccount,
          ...(rawTempPassword ? { temporaryPassword: rawTempPassword } : {}),
          email: cleanEmail,
          patientId: result.patient.id,
        };
      } catch (err: any) {
        lastError = err;
        // P2002 = unique constraint violation (concurrent duplicate) — retry once
        if (err?.code === 'P2002' && attempt < MAX_RETRIES) {
          continue;
        }
        throw err;
      }
    }

    // Should never reach here, but satisfy TypeScript
    throw lastError;
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
  static async createWaitlistEntry(input: any, userId: string | null, ipAddress: string) {
    let patientId = input.patientId;

    if (!patientId && userId) {
      const patient = await prisma.patientProfile.findUnique({ where: { userId } });
      if (patient) patientId = patient.id;
    }

    if (!patientId && input.email) {
      const cleanEmail = input.email.trim().toLowerCase();
      let patient = await prisma.patientProfile.findUnique({ where: { email: cleanEmail } });
      if (!patient) {
        patient = await prisma.patientProfile.create({
          data: {
            firstName: input.firstName || 'Waitlist',
            lastName: input.lastName || 'Patient',
            email: cleanEmail,
            phone: input.phone || null,
          },
        });
      }
      patientId = patient.id;
    }

    if (!patientId) {
      throw AppError.badRequest('Patient profile is required for waitlist entry');
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        patientId,
        serviceId: input.serviceId || undefined,
        locationId: input.locationId || undefined,
        preferredDays: input.preferredDays || null,
        notes: input.notes || null,
      },
    });

    if (userId) {
      await writeAuditLog({
        userId,
        patientId,
        action: 'WAITLIST_ENTRY_CREATED',
        resourceType: 'waitlist_entry',
        resourceId: entry.id,
        ipAddress,
      }).catch(() => {});
    }

    return entry;
  }
}
