// Radiantilyk EMR — Appointment & Scheduling Controller
// Express route handlers for Appointment CRUD, status workflow transitions, online booking, 
// time off, and waitlists.

import { Request, Response, NextFunction } from 'express';
import { AppointmentService } from '../services/appointment.service';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { AppointmentStatus } from '@prisma/client';

export class AppointmentController {
  static async getPendingCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AppointmentService.getPendingCount();
      res.status(200).json({ success: true, count: result.count, data: result });
    } catch (error) { next(error); }
  }

  static async createAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const appointment = await AppointmentService.createAppointment(req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: appointment,
        message: 'Appointment created successfully',
      });
    } catch (error) { next(error); }
  }

  static async getAppointments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawLocationId = Array.isArray(req.query.locationId) ? req.query.locationId[0] : req.query.locationId;
      const rawStaffId = Array.isArray(req.query.staffId) ? req.query.staffId[0] : req.query.staffId;
      const rawPatientId = Array.isArray(req.query.patientId) ? req.query.patientId[0] : req.query.patientId;
      const rawStartDate = Array.isArray(req.query.startDate) ? req.query.startDate[0] : req.query.startDate;
      const rawEndDate = Array.isArray(req.query.endDate) ? req.query.endDate[0] : req.query.endDate;
      const rawStatus = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
      const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

      const filters = {
        locationId: typeof rawLocationId === 'string' ? rawLocationId : undefined,
        staffId: typeof rawStaffId === 'string' ? rawStaffId : undefined,
        patientId: typeof rawPatientId === 'string' ? rawPatientId : undefined,
        startDate: typeof rawStartDate === 'string' ? rawStartDate : undefined,
        endDate: typeof rawEndDate === 'string' ? rawEndDate : undefined,
        status: typeof rawStatus === 'string' ? (rawStatus as AppointmentStatus) : undefined,
        page: Math.max(1, parseInt(rawPage as string) || 1),
        limit: Math.max(1, Math.min(100, parseInt(rawLimit as string) || 50)),
      };

      const result = await AppointmentService.getAppointments(filters);

      res.status(200).json({
        success: true,
        data: result.appointments,
        meta: result.meta,
      });
    } catch (error) { next(error); }
  }

  static async getAppointmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const apptId = (req.params.id as string);
      const appointment = await AppointmentService.getAppointmentById(apptId);

      res.status(200).json({
        success: true,
        data: appointment,
      });
    } catch (error) { next(error); }
  }

  static async transitionStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const apptId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const updated = await AppointmentService.transitionStatus(apptId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: updated,
        message: `Appointment status transitioned to '${req.body.status}'`,
      });
    } catch (error) { next(error); }
  }

  static async rescheduleAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const apptId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const newAppt = await AppointmentService.rescheduleAppointment(apptId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: newAppt,
        message: 'Appointment rescheduled successfully',
      });
    } catch (error) { next(error); }
  }

  static async cancelAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const apptId = (req.params.id as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const cancelled = await AppointmentService.cancelAppointment(apptId, req.body, userId, ip);

      res.status(200).json({
        success: true,
        data: cancelled,
        message: 'Appointment cancelled successfully',
      });
    } catch (error) { next(error); }
  }

  static async createPublicBookingRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '0.0.0.0';
      const result = await AppointmentService.createPublicBookingRequest(req.body, ip);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Online booking request submitted successfully',
      });
    } catch (error) { next(error); }
  }

  static async createStaffTimeOff(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const staffId = (req.params.staffId as string);
      const ip = (req.clientIp || '0.0.0.0') as string;

      const timeOff = await AppointmentService.createStaffTimeOff(staffId, req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: timeOff,
        message: 'Staff time off requested successfully',
      });
    } catch (error) { next(error); }
  }

  static async createWaitlistEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || null;
      const ip = ((req as any).clientIp || '0.0.0.0') as string;

      const entry = await AppointmentService.createWaitlistEntry(req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: entry,
        message: 'Patient added to waitlist successfully',
      });
    } catch (error) { next(error); }
  }
}
