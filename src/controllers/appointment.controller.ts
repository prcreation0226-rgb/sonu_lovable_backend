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
      const filters = {
        locationId: req.query.locationId as string,
        staffId: req.query.staffId as string,
        patientId: req.query.patientId as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        status: req.query.status as AppointmentStatus,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
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

  static async createWaitlistEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;

      const entry = await AppointmentService.createWaitlistEntry(req.body, userId, ip);

      res.status(201).json({
        success: true,
        data: entry,
        message: 'Patient added to waitlist successfully',
      });
    } catch (error) { next(error); }
  }
}
