// Radiantilyk EMR — HIPAA IT Device & Media Register Service
// Implements HIPAA Security Rule §164.310(d) Device and Media Controls.
// Supports CRUD, lifecycle tracking, assignment, decommissioning, disposal, and audit logging.

import { prisma } from '../config/database';
import { writeAuditLog } from '../middleware/audit';

export interface CreateHipaaDeviceInput {
  deviceName: string;
  deviceType: string;
  serialNumber: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  isEncrypted?: boolean;
  screenLockEnabled?: boolean;
  status?: string;
  dateAssigned?: string | null;
  notes?: string | null;
}

export interface UpdateHipaaDeviceInput {
  deviceName?: string;
  deviceType?: string;
  serialNumber?: string;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  operatingSystem?: string | null;
  isEncrypted?: boolean;
  screenLockEnabled?: boolean;
  status?: string;
  dateAssigned?: string | null;
  lastSecurityReviewAt?: string | null;
  decommissionDate?: string | null;
  disposalDate?: string | null;
  disposalMethod?: string | null;
  disposalNotes?: string | null;
}

export class HipaaDeviceService {
  /**
   * List HIPAA IT Devices with optional filters.
   */
  static async listDevices(params: {
    status?: string;
    deviceType?: string;
    search?: string;
  }) {
    const where: any = {};

    if (params.status && params.status !== 'all') {
      where.status = params.status;
    }

    if (params.deviceType && params.deviceType !== 'all') {
      where.deviceType = params.deviceType;
    }

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { deviceName: { contains: q } },
        { serialNumber: { contains: q } },
        { assignedUserName: { contains: q } },
        { manufacturer: { contains: q } },
        { model: { contains: q } },
      ];
    }

    const devices = await prisma.hipaaItDevice.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        assignedUser: {
          select: {
            id: true,
            email: true,
            staffProfile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    return devices;
  }

  /**
   * Get single HIPAA IT Device by ID.
   */
  static async getDeviceById(id: string) {
    const device = await prisma.hipaaItDevice.findUnique({
      where: { id },
      include: {
        assignedUser: {
          select: {
            id: true,
            email: true,
            staffProfile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!device) {
      throw new Error('HIPAA IT Device not found');
    }

    return device;
  }

  /**
   * Create new HIPAA IT Device.
   */
  static async createDevice(input: CreateHipaaDeviceInput, actorUserId: string, ipAddress: string) {
    const device = await prisma.hipaaItDevice.create({
      data: {
        deviceName: input.deviceName.trim(),
        deviceType: input.deviceType,
        serialNumber: input.serialNumber.trim(),
        assignedUserId: input.assignedUserId || null,
        assignedUserName: input.assignedUserName || null,
        manufacturer: input.manufacturer || null,
        model: input.model || null,
        operatingSystem: input.operatingSystem || null,
        isEncrypted: input.isEncrypted ?? true,
        screenLockEnabled: input.screenLockEnabled ?? true,
        status: input.status || 'active',
        dateAssigned: input.dateAssigned ? new Date(input.dateAssigned) : new Date(),
        lastSecurityReviewAt: new Date(),
        createdByUserId: actorUserId,
      },
    });

    // Write audit log
    await writeAuditLog({
      userId: actorUserId,
      action: 'HIPAA_IT_DEVICE_CREATED',
      resourceType: 'hipaa_it_device',
      resourceId: device.id,
      ipAddress,
      newValue: {
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        serialNumber: device.serialNumber,
        assignedUserName: device.assignedUserName,
        status: device.status,
        isEncrypted: device.isEncrypted,
      },
    });

    return device;
  }

  /**
   * Update HIPAA IT Device details/status.
   */
  static async updateDevice(id: string, input: UpdateHipaaDeviceInput, actorUserId: string, ipAddress: string) {
    const existing = await this.getDeviceById(id);

    const data: any = {};
    if (input.deviceName !== undefined) data.deviceName = input.deviceName.trim();
    if (input.deviceType !== undefined) data.deviceType = input.deviceType;
    if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber.trim();
    if (input.assignedUserId !== undefined) data.assignedUserId = input.assignedUserId || null;
    if (input.assignedUserName !== undefined) data.assignedUserName = input.assignedUserName || null;
    if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer || null;
    if (input.model !== undefined) data.model = input.model || null;
    if (input.operatingSystem !== undefined) data.operatingSystem = input.operatingSystem || null;
    if (input.isEncrypted !== undefined) data.isEncrypted = input.isEncrypted;
    if (input.screenLockEnabled !== undefined) data.screenLockEnabled = input.screenLockEnabled;
    if (input.status !== undefined) data.status = input.status;
    if (input.dateAssigned !== undefined) data.dateAssigned = input.dateAssigned ? new Date(input.dateAssigned) : null;
    if (input.lastSecurityReviewAt !== undefined) data.lastSecurityReviewAt = input.lastSecurityReviewAt ? new Date(input.lastSecurityReviewAt) : new Date();

    const updated = await prisma.hipaaItDevice.update({
      where: { id },
      data,
    });

    // Audit log
    await writeAuditLog({
      userId: actorUserId,
      action: 'HIPAA_IT_DEVICE_UPDATED',
      resourceType: 'hipaa_it_device',
      resourceId: updated.id,
      ipAddress,
      oldValue: {
        deviceName: existing.deviceName,
        status: existing.status,
        isEncrypted: existing.isEncrypted,
        assignedUserName: existing.assignedUserName,
      },
      newValue: {
        deviceName: updated.deviceName,
        status: updated.status,
        isEncrypted: updated.isEncrypted,
        assignedUserName: updated.assignedUserName,
      },
    });

    return updated;
  }

  /**
   * Decommission or dispose HIPAA IT Device (§164.310(d)(2)(i)).
   */
  static async decommissionOrDisposeDevice(
    id: string,
    params: {
      status: 'decommissioned' | 'disposed' | 'lost_stolen';
      decommissionDate?: string;
      disposalDate?: string;
      disposalMethod?: string;
      disposalNotes?: string;
    },
    actorUserId: string,
    ipAddress: string
  ) {
    const existing = await this.getDeviceById(id);
    const now = new Date();

    const updated = await prisma.hipaaItDevice.update({
      where: { id },
      data: {
        status: params.status,
        decommissionDate: params.decommissionDate ? new Date(params.decommissionDate) : now,
        disposalDate: params.disposalDate ? new Date(params.disposalDate) : (params.status === 'disposed' ? now : undefined),
        disposalMethod: params.disposalMethod || null,
        disposalNotes: params.disposalNotes || null,
      },
    });

    await writeAuditLog({
      userId: actorUserId,
      action: params.status === 'disposed' ? 'HIPAA_IT_DEVICE_DISPOSED' : 'HIPAA_IT_DEVICE_DECOMMISSIONED',
      resourceType: 'hipaa_it_device',
      resourceId: updated.id,
      ipAddress,
      oldValue: { status: existing.status },
      newValue: {
        status: updated.status,
        disposalMethod: updated.disposalMethod,
        disposalNotes: updated.disposalNotes,
        disposalDate: updated.disposalDate,
      },
    });

    return updated;
  }
}
