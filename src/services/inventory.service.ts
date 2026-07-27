// Radiantilyk EMR — Inventory & Procedure Lot Tracking Service
// Business logic for Products, InventoryLots, TreatmentUsage, and InventoryMovements.
//
// Healthcare Guardrails:
// 1. Expired lots CANNOT be used for treatment (enforced in recordTreatmentUsage)
// 2. Lot quantity is decremented atomically on usage
// 3. All inventory movements create append-only ledger entries
// 4. LotExpiryTracking auto-creates 30-day and 7-day alerts

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import {
  CreateProductInput,
  UpdateProductInput,
  CreateInventoryLotInput,
  RecordTreatmentUsageInput,
  CreateInventoryMovementInput,
} from '../schemas/inventory.schema';

export class InventoryService {
  // ==========================================
  // ---- PRODUCTS ----
  // ==========================================

  static async createProduct(input: CreateProductInput, userId: string, ipAddress: string) {
    // Check SKU uniqueness if provided
    if (input.sku) {
      const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
      if (existing) throw AppError.conflict(`Product with SKU '${input.sku}' already exists`);
    }

    const product = await prisma.product.create({
      data: {
        name: input.name,
        sku: input.sku || undefined,
        description: input.description || undefined,
        category: input.category || undefined,
        unit: input.unit,
        minReorderLevel: input.minReorderLevel,
      },
    });

    await writeAuditLog({
      userId,
      action: 'PRODUCT_CREATED',
      resourceType: 'product',
      resourceId: product.id,
      ipAddress,
      newValue: { name: input.name, sku: input.sku },
    });

    return product;
  }

  static async getProducts(includeInactive: boolean = false) {
    const where: any = { deletedAt: null };
    if (!includeInactive) where.isActive = true;

    return prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  static async getProductById(productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        inventoryLots: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, lotNumber: true, quantity: true, unit: true, expiryDate: true, createdAt: true },
        },
      },
    });
    if (!product) throw AppError.notFound('Product');
    return product;
  }

  static async updateProduct(productId: string, input: UpdateProductInput, userId: string, ipAddress: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw AppError.notFound('Product');

    if (input.sku && input.sku !== product.sku) {
      const existing = await prisma.product.findFirst({ where: { sku: input.sku, id: { not: productId } } });
      if (existing) throw AppError.conflict(`Product with SKU '${input.sku}' already exists`);
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        name: input.name ?? product.name,
        sku: input.sku !== undefined ? input.sku : product.sku,
        description: input.description !== undefined ? input.description : product.description,
        category: input.category !== undefined ? input.category : product.category,
        unit: input.unit ?? product.unit,
        minReorderLevel: input.minReorderLevel ?? product.minReorderLevel,
        isActive: input.isActive ?? product.isActive,
      },
    });

    await writeAuditLog({
      userId,
      action: 'PRODUCT_UPDATED',
      resourceType: 'product',
      resourceId: productId,
      ipAddress,
    });

    return updated;
  }

  static async deleteProduct(productId: string, userId: string, ipAddress: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw AppError.notFound('Product');

    await prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await writeAuditLog({
      userId,
      action: 'PRODUCT_DELETED',
      resourceType: 'product',
      resourceId: productId,
      ipAddress,
    });

    return { message: 'Product soft-deleted successfully' };
  }

  // ==========================================
  // ---- INVENTORY LOTS ----
  // ==========================================

  static async createLot(input: CreateInventoryLotInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const lot = await prisma.inventoryLot.create({
      data: {
        productId: input.productId || undefined,
        productName: input.productName,
        lotNumber: input.lotNumber,
        quantity: input.quantity,
        unit: input.unit,
        vendorId: input.vendorId || undefined,
        locationId: input.locationId,
        costPerUnitCents: input.costPerUnitCents || undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        receivedAt: new Date(input.receivedAt),
        receivedBy: staffProfile.id,
      },
      include: {
        product: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    // Auto-create expiry tracking alerts if expiry date is set
    if (input.expiryDate) {
      const expiryDate = new Date(input.expiryDate);
      const thirtyDayAlert = new Date(expiryDate);
      thirtyDayAlert.setDate(thirtyDayAlert.getDate() - 30);
      const sevenDayAlert = new Date(expiryDate);
      sevenDayAlert.setDate(sevenDayAlert.getDate() - 7);

      await prisma.lotExpiryTracking.createMany({
        data: [
          { lotId: lot.id, alertDate: thirtyDayAlert },
          { lotId: lot.id, alertDate: sevenDayAlert },
        ],
      });
    }

    await writeAuditLog({
      userId,
      action: 'INVENTORY_LOT_CREATED',
      resourceType: 'inventory_lot',
      resourceId: lot.id,
      ipAddress,
      newValue: { lotNumber: input.lotNumber, quantity: input.quantity },
    });

    return lot;
  }

  static async getLots(locationId?: string) {
    const where: any = {};
    if (locationId) where.locationId = locationId;

    return prisma.inventoryLot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });
  }

  static async getLotById(lotId: string) {
    const lot = await prisma.inventoryLot.findUnique({
      where: { id: lotId },
      include: {
        product: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
        treatmentUsages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { performer: { select: { id: true, fullName: true } } },
        },
        expiryTrackings: true,
      },
    });
    if (!lot) throw AppError.notFound('Inventory Lot');
    return lot;
  }

  static async getExpiringLots(daysAhead: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    return prisma.inventoryLot.findMany({
      where: {
        expiryDate: { lte: cutoffDate },
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        product: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  // ==========================================
  // ---- TREATMENT USAGE (Lot Consumption) ----
  // ==========================================

  static async recordTreatmentUsage(input: RecordTreatmentUsageInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const encounter = await prisma.encounter.findFirst({ where: { id: input.encounterId, deletedAt: null } });
    if (!encounter) throw AppError.notFound('Encounter');

    const lot = await prisma.inventoryLot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw AppError.notFound('Inventory Lot');

    // EXPIRED LOT GUARD: Block usage of expired lots
    if (lot.expiryDate && new Date() > lot.expiryDate) {
      throw AppError.badRequest(
        `Lot #${lot.lotNumber} expired on ${lot.expiryDate.toISOString().split('T')[0]}. Expired products cannot be used for treatment.`
      );
    }

    // INSUFFICIENT QUANTITY GUARD
    if (lot.quantity < input.unitsUsed) {
      throw AppError.badRequest(
        `Insufficient inventory. Lot #${lot.lotNumber} has ${lot.quantity} ${lot.unit} remaining, but ${input.unitsUsed} requested.`
      );
    }

    // Atomically deduct quantity and record usage
    const [usage] = await prisma.$transaction([
      prisma.treatmentUsage.create({
        data: {
          encounterId: input.encounterId,
          lotId: input.lotId,
          unitsUsed: input.unitsUsed,
          bodySite: input.bodySite || undefined,
          performedBy: staffProfile.id,
        },
      }),
      prisma.inventoryLot.update({
        where: { id: input.lotId },
        data: { quantity: { decrement: input.unitsUsed } },
      }),
      // Create movement ledger entry
      prisma.inventoryMovement.create({
        data: {
          lotId: input.lotId,
          movementType: 'used',
          quantityChange: -input.unitsUsed,
          reason: `Treatment usage for encounter ${input.encounterId}`,
          patientId: encounter.patientId,
          encounterId: input.encounterId,
          performedBy: staffProfile.id,
        },
      }),
    ]);

    await writeAuditLog({
      userId,
      patientId: encounter.patientId,
      action: 'TREATMENT_USAGE_RECORDED',
      resourceType: 'treatment_usage',
      resourceId: usage.id,
      ipAddress,
      newValue: { lotNumber: lot.lotNumber, unitsUsed: input.unitsUsed, bodySite: input.bodySite },
    });

    return usage;
  }

  // ==========================================
  // ---- INVENTORY MOVEMENTS ----
  // ==========================================

  static async createMovement(input: CreateInventoryMovementInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const lot = await prisma.inventoryLot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw AppError.notFound('Inventory Lot');

    // Validate that resulting quantity won't go negative for deductions
    if (input.quantityChange < 0 && lot.quantity + input.quantityChange < 0) {
      throw AppError.badRequest(
        `Cannot deduct ${Math.abs(input.quantityChange)} from lot #${lot.lotNumber}. Only ${lot.quantity} available.`
      );
    }

    const [movement] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          lotId: input.lotId,
          movementType: input.movementType,
          quantityChange: input.quantityChange,
          reason: input.reason || undefined,
          patientId: input.patientId || undefined,
          encounterId: input.encounterId || undefined,
          performedBy: staffProfile.id,
        },
      }),
      prisma.inventoryLot.update({
        where: { id: input.lotId },
        data: { quantity: { increment: input.quantityChange } },
      }),
    ]);

    await writeAuditLog({
      userId,
      action: 'INVENTORY_MOVEMENT_RECORDED',
      resourceType: 'inventory_movement',
      resourceId: movement.id,
      ipAddress,
      newValue: { movementType: input.movementType, quantityChange: input.quantityChange },
    });

    return movement;
  }
}
