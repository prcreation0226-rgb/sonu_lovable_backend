// Radiantilyk EMR — Staff Profile & Availability Service
// Manages practitioner/staff profiles, state licenses, clinic location assignments, and weekly availability.
// All actions write audit logs. Soft deletes set deletedAt.

import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
  AssignStaffLocationInput,
  StaffAvailabilityInput,
} from '../schemas/user.schema';

export class StaffService {
  /**
   * Create a Staff Profile for an existing User.
   */
  static async createStaffProfile(input: CreateStaffProfileInput, adminUserId: string, ipAddress: string) {
    const user = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null } });
    if (!user) throw AppError.notFound('User');

    const existingProfile = await prisma.staffProfile.findUnique({ where: { userId: input.userId } });
    if (existingProfile) {
      throw AppError.conflict('A staff profile already exists for this user account');
    }

    const profile = await prisma.staffProfile.create({
      data: {
        userId: input.userId,
        fullName: input.fullName,
        title: input.title,
        email: input.email,
        phone: input.phone,
        color: input.color || '#6366f1',
        npiNumber: input.npiNumber,
        licenseNumber: input.licenseNumber,
        licenseState: input.licenseState,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : undefined,
        isOwner: input.isOwner || false,
        hourlyRateCents: input.hourlyRateCents,
        commissionPercent: input.commissionPercent,
      },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_PROFILE_CREATED',
      resourceType: 'staff_profile',
      resourceId: profile.id,
      ipAddress,
      newValue: { fullName: profile.fullName, title: profile.title, email: profile.email },
    });

    return profile;
  }

  /**
   * Create a user account AND staff profile in one transaction.
   */
  static async createStaffWithUser(
    input: {
      fullName: string;
      title: string;
      email: string;
      password?: string;
      roleName: string;
      color?: string;
    },
    adminUserId: string,
    ipAddress: string
  ) {
    const cleanEmail = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({ where: { email: cleanEmail, deletedAt: null } });
    if (existingUser) {
      throw AppError.conflict('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password || '12345678', 12);

    let role = await prisma.role.findFirst({ where: { name: input.roleName } });
    if (!role) {
      role = await prisma.role.findFirst({ where: { name: 'staff' } });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          isActive: true,
        },
      });

      if (role) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            grantedBy: adminUserId,
          },
        });
      }

      if (role && input.roleName !== 'staff' && input.roleName !== 'admin') {
        const staffRole = await tx.role.findFirst({ where: { name: 'staff' } });
        if (staffRole && staffRole.id !== role.id) {
          await tx.userRole.create({
            data: {
              userId: user.id,
              roleId: staffRole.id,
              grantedBy: adminUserId,
            },
          }).catch(() => {});
        }
      }

      const staff = await tx.staffProfile.create({
        data: {
          userId: user.id,
          fullName: input.fullName,
          title: input.title,
          email: cleanEmail,
          color: input.color || '#6366f1',
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              userRoles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      });

      return staff;
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_PROFILE_CREATED',
      resourceType: 'staff_profile',
      resourceId: result.id,
      ipAddress,
      newValue: { fullName: result.fullName, title: result.title, email: result.email },
    });

    return result;
  }

  /**
   * List all Staff Profiles with pagination and filtering.
   */
  static async getStaffProfiles(page: number = 1, limit: number = 20, activeOnly: boolean = true) {
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (activeOnly) {
      where.isActive = true;
    }

    const [total, staff] = await Promise.all([
      prisma.staffProfile.count({ where }),
      prisma.staffProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
        include: {
          staffLocations: {
            include: { location: true },
          },
          providerServices: {
            include: { service: true },
          },
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              userRoles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);

    return {
      staff,
      meta: {
        page,
        perPage: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Staff Profile by ID.
   */
  static async getStaffById(staffId: string) {
    const staff = await prisma.staffProfile.findFirst({
      where: { id: staffId, deletedAt: null },
      include: {
        staffLocations: {
          include: { location: true },
        },
        providerServices: {
          include: { service: true },
        },
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            userRoles: { select: { role: { select: { name: true, description: true } } } },
          },
        },
      },
    });

    if (!staff) {
      throw AppError.notFound('Staff Profile');
    }

    return staff;
  }

  /**
   * Update Staff Profile.
   */
  static async updateStaffProfile(
    staffId: string,
    input: UpdateStaffProfileInput,
    adminUserId: string,
    ipAddress: string
  ) {
    const existing = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Staff Profile');

    const updated = await prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        fullName: input.fullName,
        title: input.title,
        email: input.email,
        phone: input.phone,
        color: input.color,
        npiNumber: input.npiNumber,
        licenseNumber: input.licenseNumber,
        licenseState: input.licenseState,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : undefined,
        isOwner: input.isOwner,
        hourlyRateCents: input.hourlyRateCents,
        commissionPercent: input.commissionPercent,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_PROFILE_UPDATED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      oldValue: { fullName: existing.fullName, title: existing.title },
      newValue: { fullName: updated.fullName, title: updated.title },
    });

    return updated;
  }

  /**
   * Soft-delete Staff Profile AND linked User account.
   */
  static async deleteStaffProfile(staffId: string, adminUserId: string, ipAddress: string) {
    const existing = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Staff Profile');

    await prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staffId },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      if (existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            deletedAt: new Date(),
            isActive: false,
          },
        });
      }
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_PROFILE_DELETED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      oldValue: { fullName: existing.fullName, email: existing.email },
    });
  }

  /**
   * Assign Staff Member to a Location.
   */
  static async assignLocation(staffId: string, input: AssignStaffLocationInput, adminUserId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!staff) throw AppError.notFound('Staff Profile');

    const location = await prisma.location.findFirst({ where: { id: input.locationId, deletedAt: null } });
    if (!location) throw AppError.notFound('Location');

    // If marked as primary, unmark other primary locations for this staff
    if (input.isPrimary) {
      await prisma.staffLocation.updateMany({
        where: { staffId },
        data: { isPrimary: false },
      });
    }

    const assignment = await prisma.staffLocation.upsert({
      where: {
        staffId_locationId: { staffId, locationId: input.locationId },
      },
      update: {
        isPrimary: input.isPrimary || false,
      },
      create: {
        staffId,
        locationId: input.locationId,
        isPrimary: input.isPrimary || false,
      },
      include: { location: true },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_LOCATION_ASSIGNED',
      resourceType: 'staff_location',
      resourceId: staffId,
      ipAddress,
      newValue: { staffId, locationId: input.locationId, isPrimary: input.isPrimary },
    });

    return assignment;
  }

  /**
   * Set Staff Availability Schedule.
   */
  static async setAvailability(staffId: string, input: StaffAvailabilityInput, adminUserId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!staff) throw AppError.notFound('Staff Profile');

    const availability = await prisma.staffAvailability.create({
      data: {
        staffId,
        locationId: input.locationId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        isRecurring: input.isRecurring !== undefined ? input.isRecurring : true,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_AVAILABILITY_SET',
      resourceType: 'staff_availability',
      resourceId: staffId,
      ipAddress,
      newValue: input,
    });

    return availability;
  }

  /**
   * Get Availability Schedule for a Staff Member.
   */
  static async getStaffAvailability(staffId: string) {
    const staff = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!staff) throw AppError.notFound('Staff Profile');

    return prisma.staffAvailability.findMany({
      where: { staffId },
      include: { location: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
