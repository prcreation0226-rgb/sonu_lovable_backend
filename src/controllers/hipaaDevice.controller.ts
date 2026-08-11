// Radiantilyk EMR — HIPAA IT Device Controller
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { HipaaDeviceService } from '../services/hipaaDevice.service';

export class HipaaDeviceController {
  static async listDevices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const deviceType = typeof req.query.deviceType === 'string' ? req.query.deviceType : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const devices = await HipaaDeviceService.listDevices({ status, deviceType, search });
      res.json(devices);
    } catch (error) {
      next(error);
    }
  }

  static async getDeviceById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const device = await HipaaDeviceService.getDeviceById(id);
      res.json(device);
    } catch (error) {
      next(error);
    }
  }

  static async createDevice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const actorUserId = req.user?.id || 'system';
      const ipAddress = Array.isArray(req.ip) ? req.ip[0] : (req.ip || '127.0.0.1');
      const device = await HipaaDeviceService.createDevice(req.body, actorUserId, ipAddress);
      res.status(201).json(device);
    } catch (error) {
      next(error);
    }
  }

  static async updateDevice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const actorUserId = req.user?.id || 'system';
      const ipAddress = Array.isArray(req.ip) ? req.ip[0] : (req.ip || '127.0.0.1');
      const device = await HipaaDeviceService.updateDevice(id, req.body, actorUserId, ipAddress);
      res.json(device);
    } catch (error) {
      next(error);
    }
  }

  static async decommissionOrDisposeDevice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const actorUserId = req.user?.id || 'system';
      const ipAddress = Array.isArray(req.ip) ? req.ip[0] : (req.ip || '127.0.0.1');
      const device = await HipaaDeviceService.decommissionOrDisposeDevice(id, req.body, actorUserId, ipAddress);
      res.json(device);
    } catch (error) {
      next(error);
    }
  }
}
