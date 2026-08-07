import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';

export class PatientAccountService {
  /**
   * Grant PATIENT_ACCOUNT_MANAGER role to a specific Front Desk staff member.
   * Admin only.
   */
  static async grantPatientAccountManager(staffId: string, adminUserId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      include: {
        user: {
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        },
      },
    });

    if (!staff || !staff.userId || !staff.user) {
      throw AppError.notFound('Staff profile or linked user account not found');
    }

    // Target restriction check: User MUST have the front_desk role
    const hasFrontDeskRole = staff.user.userRoles.some((ur) => ur.role.name === 'front_desk');
    if (!hasFrontDeskRole) {
      throw AppError.forbidden('PATIENT_ACCOUNT_MANAGER role can ONLY be granted to staff members with the front_desk role');
    }

    // Ensure PATIENT_ACCOUNT_MANAGE Permission and RolePermission records exist in DB
    let permission = await prisma.permission.findFirst({ where: { code: 'PATIENT_ACCOUNT_MANAGE' } });
    if (!permission) {
      permission = await prisma.permission.create({
        data: {
          code: 'PATIENT_ACCOUNT_MANAGE',
          description: 'Permission to manage patient login accounts',
        },
      });
    }

    let managerRole = await prisma.role.findFirst({ where: { name: 'patient_account_manager' } });
    if (!managerRole) {
      managerRole = await prisma.role.create({
        data: {
          name: 'patient_account_manager',
          description: 'Patient Account Manager role for selected Front Desk staff',
        },
      });
    }

    // Link PATIENT_ACCOUNT_MANAGE permission to patient_account_manager role
    const existingRpManager = await prisma.rolePermission.findFirst({
      where: { roleId: managerRole.id, permissionId: permission.id },
    });
    if (!existingRpManager) {
      await prisma.rolePermission.create({
        data: { roleId: managerRole.id, permissionId: permission.id },
      }).catch(() => {});
    }

    // Link PATIENT_ACCOUNT_MANAGE permission to admin role
    const adminRole = await prisma.role.findFirst({ where: { name: 'admin' } });
    if (adminRole) {
      const existingRpAdmin = await prisma.rolePermission.findFirst({
        where: { roleId: adminRole.id, permissionId: permission.id },
      });
      if (!existingRpAdmin) {
        await prisma.rolePermission.create({
          data: { roleId: adminRole.id, permissionId: permission.id },
        }).catch(() => {});
      }
    }

    const existingUserRole = await prisma.userRole.findFirst({
      where: { userId: staff.userId, roleId: managerRole.id },
    });

    if (!existingUserRole) {
      await prisma.userRole.create({
        data: {
          userId: staff.userId,
          roleId: managerRole.id,
          grantedBy: adminUserId,
        },
      });
    }

    await writeAuditLog({
      userId: adminUserId,
      action: 'PATIENT_ACCOUNT_MANAGER_GRANTED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      newValue: { targetUserId: staff.userId, role: 'patient_account_manager' },
    });

    return { success: true, message: `Granted Patient Account Manager access to ${staff.fullName}` };
  }

  /**
   * Revoke PATIENT_ACCOUNT_MANAGER role from a staff member.
   * Admin only. Does NOT touch their front_desk or other roles.
   */
  static async revokePatientAccountManager(staffId: string, adminUserId: string, ipAddress: string) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: staffId } });
    if (!staff || !staff.userId) {
      throw AppError.notFound('Staff profile or linked user account not found');
    }

    const role = await prisma.role.findFirst({ where: { name: 'patient_account_manager' } });
    if (role) {
      await prisma.userRole.deleteMany({
        where: { userId: staff.userId, roleId: role.id },
      });
    }

    await writeAuditLog({
      userId: adminUserId,
      action: 'PATIENT_ACCOUNT_MANAGER_REVOKED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      newValue: { targetUserId: staff.userId, role: 'patient_account_manager' },
    });

    return { success: true, message: `Revoked Patient Account Manager access from ${staff.fullName}` };
  }

  /**
   * List Patient Accounts for Management.
   */
  static async getPatientAccounts(search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
      ];
    }

    const [total, profiles] = await Promise.all([
      prisma.patientProfile.count({ where }),
      prisma.patientProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              mustChangePassword: true,
              lockedUntil: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const now = new Date();
    const accounts = profiles.map((p) => {
      const user = p.user;
      const isLocked = !!(user?.lockedUntil && user.lockedUntil > now);

      return {
        patientProfileId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        userId: user?.id || null,
        hasUser: !!user,
        isActive: user ? user.isActive : false,
        isLocked,
        lockedUntil: user?.lockedUntil || null,
        mustChangePassword: user ? user.mustChangePassword : false,
        lastLoginAt: user?.lastLoginAt || null,
        createdAt: p.createdAt,
      };
    });

    return {
      accounts,
      meta: {
        page,
        perPage: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create Login Access for an existing PatientProfile (if userId is null).
   */
  static async createPatientLogin(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient) throw AppError.notFound('Patient profile');
    if (patient.userId) {
      throw AppError.badRequest('Patient profile already has a linked user login account');
    }

    const cleanEmail = patient.email.trim().toLowerCase();
    const rawTempPassword = `RKA-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`;
    const hashedPassword = await bcrypt.hash(rawTempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      let patientRole = await tx.role.findFirst({ where: { name: 'patient' } });
      if (!patientRole) {
        throw new AppError('Patient role is not configured in the system', 500);
      }

      let user = await tx.user.findFirst({ where: { email: cleanEmail, deletedAt: null } });

      if (user) {
        // Link existing user
        await tx.patientProfile.update({
          where: { id: patient.id },
          data: { userId: user.id },
        });
        return { user, rawTempPassword: undefined };
      }

      // Create new User account
      user = await tx.user.create({
        data: {
          email: cleanEmail,
          passwordHash: hashedPassword,
          isActive: true,
          mustChangePassword: true,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: patientRole.id,
        },
      });

      await tx.patientProfile.update({
        where: { id: patient.id },
        data: { userId: user.id },
      });

      return { user, rawTempPassword };
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'PATIENT_LOGIN_CREATED',
      resourceType: 'patient_profile',
      resourceId: patientProfileId,
      ipAddress,
      newValue: { targetUserId: result.user.id, email: cleanEmail },
    });

    return {
      email: cleanEmail,
      temporaryPassword: result.rawTempPassword,
      mustChangePassword: true,
      patientProfileId,
    };
  }

  /**
   * Deactivate Patient Login (User.isActive = false).
   */
  static async deactivatePatientLogin(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient || !patient.userId) throw AppError.notFound('Patient login account');

    await prisma.user.update({
      where: { id: patient.userId },
      data: { isActive: false },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'PATIENT_LOGIN_DEACTIVATED',
      resourceType: 'user',
      resourceId: patient.userId,
      ipAddress,
    });

    return { success: true, message: 'Patient login account deactivated successfully' };
  }

  /**
   * Activate Patient Login (User.isActive = true).
   */
  static async activatePatientLogin(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient || !patient.userId) throw AppError.notFound('Patient login account');

    await prisma.user.update({
      where: { id: patient.userId },
      data: { isActive: true },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'PATIENT_LOGIN_ACTIVATED',
      resourceType: 'user',
      resourceId: patient.userId,
      ipAddress,
    });

    return { success: true, message: 'Patient login account activated successfully' };
  }

  /**
   * Unlock Locked Patient Account.
   */
  static async unlockPatientAccount(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient || !patient.userId) throw AppError.notFound('Patient login account');

    await prisma.user.update({
      where: { id: patient.userId },
      data: { lockedUntil: null, failedAttempts: 0 },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'PATIENT_ACCOUNT_UNLOCKED',
      resourceType: 'user',
      resourceId: patient.userId,
      ipAddress,
    });

    return { success: true, message: 'Patient account unlocked successfully' };
  }

  /**
   * Reset Patient Access (Generate new one-time temporary password).
   */
  static async resetPatientAccess(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient || !patient.userId) throw AppError.notFound('Patient login account');

    const user = await prisma.user.findUnique({ where: { id: patient.userId } });
    if (!user) throw AppError.notFound('User');

    const rawTempPassword = `RKA-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`;
    const newPasswordHash = await bcrypt.hash(rawTempPassword, 12);

    // Save old password to history
    await prisma.passwordHistory.create({
      data: {
        userId: user.id,
        passwordHash: user.passwordHash,
      },
    });

    // Revoke all active refresh tokens & sessions for this user in DB
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    }).catch(() => {});

    await prisma.session.deleteMany({
      where: { userId: user.id },
    }).catch(() => {});

    // Update password hash & set mustChangePassword = true
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: true,
        lockedUntil: null,
        failedAttempts: 0,
      },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'PATIENT_ACCESS_RESET',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress,
    });

    return {
      email: user.email,
      temporaryPassword: rawTempPassword,
      mustChangePassword: true,
    };
  }

  /**
   * Force Password Change on Next Login (mustChangePassword = true).
   */
  static async forcePasswordChange(patientProfileId: string, actingUserId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findUnique({ where: { id: patientProfileId } });
    if (!patient || !patient.userId) throw AppError.notFound('Patient login account');

    await prisma.user.update({
      where: { id: patient.userId },
      data: { mustChangePassword: true },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: patientProfileId,
      action: 'FORCED_PASSWORD_CHANGE_ENABLED',
      resourceType: 'user',
      resourceId: patient.userId,
      ipAddress,
    });

    return { success: true, message: 'Forced password change enabled for patient' };
  }
}
