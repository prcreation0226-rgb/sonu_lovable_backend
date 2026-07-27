// Radiantilyk EMR — Location Controller & Routes
// Express route handlers and router for clinic location management.

import { Router, Request, Response, NextFunction } from 'express';
import { LocationService, LocationSchema } from '../services/location.service';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class LocationController {
  static async createLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const location = await LocationService.createLocation(req.body, adminUserId, ip);
      res.status(201).json({ success: true, data: location, message: 'Location created' });
    } catch (error) { next(error); }
  }

  static async getLocations(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const locations = await LocationService.getLocations();
      res.status(200).json({ success: true, data: locations });
    } catch (error) { next(error); }
  }

  static async getLocationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const location = await LocationService.getLocationById(req.params.id as string);
      res.status(200).json({ success: true, data: location });
    } catch (error) { next(error); }
  }

  static async updateLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const location = await LocationService.updateLocation(req.params.id as string, req.body, adminUserId, ip);
      res.status(200).json({ success: true, data: location, message: 'Location updated' });
    } catch (error) { next(error); }
  }

  static async deleteLocation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminUserId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      await LocationService.deleteLocation(req.params.id as string, adminUserId, ip);
      res.status(200).json({ success: true, message: 'Location deleted' });
    } catch (error) { next(error); }
  }
}

const locationRouter = Router();
locationRouter.use(authenticate);

locationRouter.post('/', requireRoles('admin'), validate({ body: LocationSchema }), LocationController.createLocation);
locationRouter.get('/', requireRoles(...STAFF_ROLES), LocationController.getLocations);
locationRouter.get('/:id', requireRoles(...STAFF_ROLES), LocationController.getLocationById);
locationRouter.patch('/:id', requireRoles('admin'), LocationController.updateLocation);
locationRouter.delete('/:id', requireRoles('admin'), LocationController.deleteLocation);

export default locationRouter;
