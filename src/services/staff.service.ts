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

    const existingStaff = await prisma.staffProfile.findFirst({
      where: { email: cleanEmail, deletedAt: null },
    });
    if (existingStaff) {
      throw AppError.conflict(`An account with email "${cleanEmail}" already exists`);
    }

    if (!input.password) {
      throw AppError.badRequest('Password is required for staff account creation');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);

    let role = await prisma.role.findFirst({ where: { name: input.roleName } });
    if (!role) {
      try {
        role = await prisma.role.create({
          data: {
            name: input.roleName,
            description: `${input.roleName.replace(/_/g, ' ')} role`,
          },
        });
      } catch {
        role = await prisma.role.findFirst({ where: { name: input.roleName } });
      }
    }
    if (!role) {
      role = await prisma.role.findFirst({ where: { name: 'staff' } });
    }

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({ where: { email: cleanEmail } });

      if (user) {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            isActive: true,
            deletedAt: null,
          },
        });
      } else {
        user = await tx.user.create({
          data: {
            email: cleanEmail,
            passwordHash,
            isActive: true,
          },
        });
      }

      if (role) {
        await tx.userRole.deleteMany({ where: { userId: user.id } }).catch(() => { });
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            grantedBy: adminUserId,
          },
        });

        if (input.roleName !== 'staff' && input.roleName !== 'admin') {
          const staffRole = await tx.role.findFirst({ where: { name: 'staff' } });
          if (staffRole && staffRole.id !== role.id) {
            await tx.userRole.create({
              data: {
                userId: user.id,
                roleId: staffRole.id,
                grantedBy: adminUserId,
              },
            }).catch(() => { });
          }
        }
      }

      const existingProfile = await tx.staffProfile.findFirst({ where: { email: cleanEmail } });
      let staff;
      if (existingProfile) {
        staff = await tx.staffProfile.update({
          where: { id: existingProfile.id },
          data: {
            userId: user.id,
            fullName: input.fullName,
            title: input.title,
            color: input.color || '#6366f1',
            isActive: true,
            deletedAt: null,
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
      } else {
        staff = await tx.staffProfile.create({
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
      }

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
    input: any,
    adminUserId: string,
    ipAddress: string
  ) {
    const existing = await prisma.staffProfile.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!existing) throw AppError.notFound('Staff Profile');

    const fullName = input.fullName || input.full_name || existing.fullName;
    const title = input.title || existing.title;
    const email = input.email ? input.email.trim().toLowerCase() : existing.email;
    const color = input.color || existing.color;

    const updated = await prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        fullName,
        title,
        email,
        phone: input.phone !== undefined ? input.phone : existing.phone,
        color,
        npiNumber: input.npiNumber !== undefined ? input.npiNumber : existing.npiNumber,
        licenseNumber: input.licenseNumber !== undefined ? input.licenseNumber : existing.licenseNumber,
        licenseState: input.licenseState !== undefined ? input.licenseState : existing.licenseState,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : existing.licenseExpiry,
        isOwner: input.isOwner !== undefined ? input.isOwner : existing.isOwner,
        hourlyRateCents: input.hourlyRateCents !== undefined ? input.hourlyRateCents : existing.hourlyRateCents,
        commissionPercent: input.commissionPercent !== undefined ? input.commissionPercent : existing.commissionPercent,
      },
    });

    if (existing.userId) {
      const userUpdateData: any = {};
      if (email && email !== existing.email) {
        userUpdateData.email = email;
      }
      if (input.password && input.password !== '••••••••' && input.password.trim().length >= 6) {
        userUpdateData.passwordHash = await bcrypt.hash(input.password.trim(), 12);
      }
      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: existing.userId },
          data: userUpdateData,
        });
      }

      const targetRole = input.roleName || input.role;
      if (targetRole) {
        let role = await prisma.role.findFirst({ where: { name: targetRole } });
        if (!role) {
          try {
            role = await prisma.role.create({
              data: { name: targetRole, description: `${targetRole} role` },
            });
          } catch {
            role = await prisma.role.findFirst({ where: { name: targetRole } });
          }
        }
        if (role) {
          await prisma.userRole.deleteMany({ where: { userId: existing.userId } });
          await prisma.userRole.create({
            data: { userId: existing.userId, roleId: role.id, grantedBy: adminUserId },
          });
          if (targetRole !== 'staff' && targetRole !== 'admin') {
            const staffRole = await prisma.role.findFirst({ where: { name: 'staff' } });
            if (staffRole && staffRole.id !== role.id) {
              await prisma.userRole.create({
                data: { userId: existing.userId, roleId: staffRole.id, grantedBy: adminUserId },
              }).catch(() => { });
            }
          }
        }
      }
    }

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
   * Smart Delete Staff Profile AND linked User account.
   * If staff has 0 linked appointments or chart notes, performs HARD DELETE (permanently removes from MySQL).
   * If staff has linked patient records, performs SOFT DELETE (deletedAt = now) to preserve foreign keys & HIPAA audit trail.
   */
  static async deleteStaffProfile(staffId: string, adminUserId: string, ipAddress: string) {
    const existing = await prisma.staffProfile.findFirst({
      where: {
        OR: [
          { id: staffId },
          { userId: staffId },
        ],
      },
    });

    if (!existing) {
      // If staff profile is not found in DB or already deleted, return gracefully
      return;
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Deactivate & Soft-delete StaffProfile (preserves FK integrity & medical audit trail)
      await tx.staffProfile.update({
        where: { id: existing.id },
        data: {
          deletedAt: now,
          isActive: false,
        },
      });

      // Deactivate & Soft-delete linked User account
      if (existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            deletedAt: now,
            isActive: false,
          },
        }).catch(() => {});

        // Immediately revoke active sessions and refresh tokens
        await tx.session.deleteMany({ where: { userId: existing.userId } }).catch(() => {});
        await tx.refreshToken.deleteMany({ where: { userId: existing.userId } }).catch(() => {});
      }
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'STAFF_PROFILE_DELETED',
      resourceType: 'staff_profile',
      resourceId: existing.id,
      ipAddress,
      oldValue: { fullName: existing.fullName, email: existing.email, deleteType: 'SOFT' },
    }).catch(() => {});
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
