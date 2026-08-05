// Radiantilyk EMR — Service Routes
// Express route handlers for clinic service offerings.

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const ServiceSchema = z.object({
  name: z.string().min(1, 'Service name required').max(255),
  slug: z.string().optional(),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().default(30),
  priceCents: z.number().int().nonnegative().optional(),
});

const router = Router();

// Internal staff routes for service lookup
router.get(
  '/',
  authenticate,
  requireRoles(...STAFF_ROLES),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const services = await prisma.service.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
      });
      res.status(200).json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  authenticate,
  requireRoles(...STAFF_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const service = await prisma.service.findFirst({
        where: { id: req.params.id as string, deletedAt: null },
      });
      if (!service) {
        res.status(404).json({ success: false, message: 'Service not found' });
        return;
      }
      res.status(200).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }
);

// Admin-only creation route
router.post(
  '/',
  authenticate,
  requireRoles('admin'),
  validate({ body: ServiceSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, slug, description, durationMinutes, priceCents } = req.body;
      const autoSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      const service = await prisma.service.create({
        data: {
          name,
          slug: `${autoSlug}-${Date.now().toString(36)}`,
          description,
          durationMinutes: durationMinutes || 30,
          priceCents: priceCents || 15000,
          isActive: true,
        },
      });

      res.status(201).json({ success: true, data: service, message: 'Service created successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Admin-only soft-delete route
router.delete(
  '/:id',
  authenticate,
  requireRoles('admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const serviceId = req.params.id as string;
      await prisma.service.update({
        where: { id: serviceId },
        data: { deletedAt: new Date(), isActive: false },
      });
      res.status(200).json({ success: true, message: 'Service soft-deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
