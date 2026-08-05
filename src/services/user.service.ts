// Radiantilyk EMR — User & Permission Service
// Manages User accounts, role assignments, account lock/unlock, and role permissions.
// Password hashes are strictly excluded from all API output. All actions write audit logs.

import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { UserRoleName } from '../types';
import { CreateUserInput, UpdateUserInput, LockUnlockUserInput } from '../schemas/user.schema';

const BCRYPT_SALT_ROUNDS = 12;

export class UserService {
  /**
   * Create a new User account with initial roles.
   */
  static async createUser(input: CreateUserInput, adminUserId: string, ipAddress: string) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppError.conflict('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    // Verify all roles exist
    const roles = await prisma.role.findMany({
      where: { name: { in: input.roleNames } },
    });

    if (roles.length !== input.roleNames.length) {
      throw AppError.badRequest('One or more specified role names are invalid');
    }

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        isActive: true,
        userRoles: {
          create: roles.map((r) => ({
            roleId: r.id,
            grantedBy: adminUserId,
          })),
        },
      },
      select: {
        id: true,
        email: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
        userRoles: {
          select: {
            role: { select: { name: true, description: true } },
          },
        },
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'USER_CREATED',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress,
      newValue: { email: user.email, roles: input.roleNames },
    });

    return user;
  }

  /**
   * List users with pagination and search.
   */
  static async getUsers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (search) {
      where.email = { contains: search };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          isActive: true,
          mfaEnabled: true,
          lastLoginAt: true,
          lockedUntil: true,
          failedAttempts: true,
          createdAt: true,
          userRoles: {
            select: {
              role: { select: { id: true, name: true } },
            },
          },
          staffProfile: {
            select: { id: true, fullName: true, title: true },
          },
        },
      }),
    ]);

    return {
      users,
      meta: {
        page,
        perPage: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get User by ID.
   */
  static async getUserById(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        failedAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, name: true, description: true } },
            grantedBy: true,
            createdAt: true,
          },
        },
        staffProfile: {
          select: { id: true, fullName: true, title: true, phone: true },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User');
    }

    return user;
  }

  /**
   * Update User details (email, active status).
   */
  static async updateUser(userId: string, input: UpdateUserInput, adminUserId: string, ipAddress: string) {
    const existing = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw AppError.notFound('User');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        email: input.email,
        isActive: input.isActive,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
        mfaEnabled: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'USER_UPDATED',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      oldValue: { email: existing.email, isActive: existing.isActive },
      newValue: { email: updated.email, isActive: updated.isActive },
    });

    return updated;
  }

  /**
   * Lock or Unlock User account.
   */
  static async lockUnlockUser(userId: string, input: LockUnlockUserInput, adminUserId: string, ipAddress: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw AppError.notFound('User');

    const lockedUntil = input.lock ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null; // 1 year lock or null
    const failedAttempts = input.lock ? 5 : 0;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil,
        failedAttempts,
      },
      select: {
        id: true,
        email: true,
        lockedUntil: true,
        failedAttempts: true,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: input.lock ? 'ACCOUNT_LOCKED_ADMIN' : 'ACCOUNT_UNLOCKED_ADMIN',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      newValue: { lockedUntil, reason: input.reason },
    });

    return updated;
  }

  /**
   * Assign a role to a user.
   */
  static async assignRole(userId: string, roleName: UserRoleName, adminUserId: string, ipAddress: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw AppError.notFound('User');

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw AppError.badRequest(`Role '${roleName}' does not exist`);

    const existingRole = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });

    if (existingRole) {
      throw AppError.conflict(`User already has the '${roleName}' role`);
    }

    await prisma.userRole.create({
      data: {
        userId,
        roleId: role.id,
        grantedBy: adminUserId,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'ROLE_ASSIGNED',
      resourceType: 'user_role',
      resourceId: userId,
      ipAddress,
      newValue: { roleName },
    });

    return this.getUserById(userId);
  }

  /**
   * Remove a role from a user.
   */
  static async removeRole(userId: string, roleName: UserRoleName, adminUserId: string, ipAddress: string) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw AppError.badRequest(`Role '${roleName}' does not exist`);

    const userRole = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });

    if (!userRole) {
      throw AppError.notFound(`User does not have the '${roleName}' role`);
    }

    await prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'ROLE_REMOVED',
      resourceType: 'user_role',
      resourceId: userId,
      ipAddress,
      oldValue: { roleName },
    });

    return this.getUserById(userId);
  }

  /**
   * Soft-delete a user account.
   */
  static async deleteUser(userId: string, adminUserId: string, ipAddress: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw AppError.notFound('User');

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // Deactivate associated sessions
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.refreshToken.updateMany({ where: { userId }, data: { isRevoked: true } });

    await writeAuditLog({
      userId: adminUserId,
      action: 'USER_DELETED',
      resourceType: 'user',
      resourceId: userId,
      ipAddress,
      oldValue: { email: user.email },
    });
  }

  /**
   * List all Roles and associated Permissions.
   */
  static async getRolesAndPermissions() {
    return prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Assign permission to a role.
   */
  static async assignPermissionToRole(roleName: string, permissionCode: string, adminUserId: string, ipAddress: string) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw AppError.notFound('Role');

    const permission = await prisma.permission.findUnique({ where: { code: permissionCode } });
    if (!permission) throw AppError.notFound('Permission');

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'ROLE_PERMISSION_ASSIGNED',
      resourceType: 'role_permission',
      resourceId: role.id,
      ipAddress,
      newValue: { roleName, permissionCode },
    });

    return this.getRolesAndPermissions();
  }
}
