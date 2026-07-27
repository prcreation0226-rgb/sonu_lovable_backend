// Radiantilyk EMR — Inventory Controller
// Express handlers for Products, InventoryLots, TreatmentUsage, and InventoryMovements.

import { Request, Response, NextFunction } from 'express';
import { InventoryService } from '../services/inventory.service';
import { AuthenticatedRequest } from '../types';

export class InventoryController {
  // ---- Products ----

  static async createProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const product = await InventoryService.createProduct(req.body, userId, ip);
      res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
    } catch (error) { next(error); }
  }

  static async getProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const products = await InventoryService.getProducts(includeInactive);
      res.status(200).json({ success: true, data: products });
    } catch (error) { next(error); }
  }

  static async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await InventoryService.getProductById(req.params.id as string);
      res.status(200).json({ success: true, data: product });
    } catch (error) { next(error); }
  }

  static async updateProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const product = await InventoryService.updateProduct(req.params.id as string, req.body, userId, ip);
      res.status(200).json({ success: true, data: product, message: 'Product updated successfully' });
    } catch (error) { next(error); }
  }

  static async deleteProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await InventoryService.deleteProduct(req.params.id as string, userId, ip);
      res.status(200).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  // ---- Lots ----

  static async createLot(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const lot = await InventoryService.createLot(req.body, userId, ip);
      res.status(201).json({ success: true, data: lot, message: 'Inventory lot created successfully' });
    } catch (error) { next(error); }
  }

  static async getLots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const locationId = req.query.locationId as string | undefined;
      const lots = await InventoryService.getLots(locationId);
      res.status(200).json({ success: true, data: lots });
    } catch (error) { next(error); }
  }

  static async getLotById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lot = await InventoryService.getLotById(req.params.id as string);
      res.status(200).json({ success: true, data: lot });
    } catch (error) { next(error); }
  }

  static async getExpiringLots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const daysAhead = parseInt(req.query.daysAhead as string) || 30;
      const lots = await InventoryService.getExpiringLots(daysAhead);
      res.status(200).json({ success: true, data: lots });
    } catch (error) { next(error); }
  }

  // ---- Treatment Usage ----

  static async recordTreatmentUsage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const usage = await InventoryService.recordTreatmentUsage(req.body, userId, ip);
      res.status(201).json({ success: true, data: usage, message: 'Treatment usage recorded successfully' });
    } catch (error) { next(error); }
  }

  // ---- Movements ----

  static async createMovement(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const movement = await InventoryService.createMovement(req.body, userId, ip);
      res.status(201).json({ success: true, data: movement, message: 'Inventory movement recorded successfully' });
    } catch (error) { next(error); }
  }
}
