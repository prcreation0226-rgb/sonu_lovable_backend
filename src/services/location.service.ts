// Radiantilyk EMR — Location Service
// Manages practice locations (San Jose main clinic, satellite offices).

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { z } from 'zod';

export const LocationSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(255),
  address: z.string().optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().length(2, 'State must be 2 letters').optional(),
  zipCode: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
  timezone: z.string().default('America/Los_Angeles'),
});

export type LocationInput = z.infer<typeof LocationSchema>;

export class LocationService {
  static async createLocation(input: LocationInput, adminUserId: string, ipAddress: string) {
    const location = await prisma.location.create({
      data: {
        name: input.name,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        phone: input.phone,
        timezone: input.timezone,
      },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'LOCATION_CREATED',
      resourceType: 'location',
      resourceId: location.id,
      ipAddress,
      newValue: { name: location.name, city: location.city },
    });

    return location;
  }

  static async getLocations() {
    return prisma.location.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  static async getLocationById(id: string) {
    const location = await prisma.location.findFirst({
      where: { id, deletedAt: null },
    });
    if (!location) throw AppError.notFound('Location');
    return location;
  }

  static async updateLocation(id: string, input: Partial<LocationInput>, adminUserId: string, ipAddress: string) {
    const existing = await prisma.location.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('Location');

    const updated = await prisma.location.update({
      where: { id },
      data: input,
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'LOCATION_UPDATED',
      resourceType: 'location',
      resourceId: id,
      ipAddress,
      oldValue: { name: existing.name },
      newValue: { name: updated.name },
    });

    return updated;
  }

  static async deleteLocation(id: string, adminUserId: string, ipAddress: string) {
    const existing = await prisma.location.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('Location');

    await prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await writeAuditLog({
      userId: adminUserId,
      action: 'LOCATION_DELETED',
      resourceType: 'location',
      resourceId: id,
      ipAddress,
      oldValue: { name: existing.name },
    });
  }
}
