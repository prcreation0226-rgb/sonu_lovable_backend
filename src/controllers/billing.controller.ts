// Radiantilyk EMR — Billing & Payments Controller
// Express handlers for Checkout Transactions, Invoices, Payments, Refunds, Credits, and NoShowCharges.

import { Request, Response, NextFunction } from 'express';
import { BillingService } from '../services/billing.service';
import { AuthenticatedRequest } from '../types';

export class BillingController {
  // ---- Checkout Transaction ----

  static async checkoutTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const result = await BillingService.checkoutTransaction(req.body, userId, ip);
      res.status(201).json({ success: true, data: result, message: 'Checkout transaction completed successfully' });
    } catch (error) { next(error); }
  }

  // ---- Invoices ----

  static async createInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const invoice = await BillingService.createInvoice(req.body, userId, ip);
      res.status(201).json({ success: true, data: invoice, message: 'Invoice created successfully' });
    } catch (error) { next(error); }
  }

  static async getInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 25;
      const result = await BillingService.getInvoices(page, perPage);
      res.status(200).json({ success: true, data: result.invoices, meta: result.meta });
    } catch (error) { next(error); }
  }

  static async getInvoiceById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await BillingService.getInvoiceById(req.params.id as string, req.user);
      res.status(200).json({ success: true, data: invoice });
    } catch (error) { next(error); }
  }

  static async getPatientInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoices = await BillingService.getPatientInvoices(req.params.patientId as string, req.user);
      res.status(200).json({ success: true, data: invoices });
    } catch (error) { next(error); }
  }

  static async cancelInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const invoice = await BillingService.cancelInvoice(req.params.id as string, userId, ip);
      res.status(200).json({ success: true, data: invoice, message: 'Invoice cancelled successfully' });
    } catch (error) { next(error); }
  }

  // ---- Payments ----

  static async recordPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const payment = await BillingService.recordPayment(req.body, userId, ip);
      res.status(201).json({ success: true, data: payment, message: 'Payment recorded successfully' });
    } catch (error) { next(error); }
  }

  // ---- Refunds ----

  static async createRefund(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const refund = await BillingService.createRefund(req.body, userId, ip);
      res.status(201).json({ success: true, data: refund, message: 'Refund processed successfully' });
    } catch (error) { next(error); }
  }

  // ---- Credits ----

  static async createCredit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const credit = await BillingService.createCredit(req.body, userId, ip);
      res.status(201).json({ success: true, data: credit, message: 'Patient credit issued successfully' });
    } catch (error) { next(error); }
  }

  static async getPatientCredits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const credits = await BillingService.getPatientCredits(req.params.patientId as string);
      res.status(200).json({ success: true, data: credits });
    } catch (error) { next(error); }
  }

  // ---- No-Show Charges ----

  static async createNoShowCharge(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = (req.clientIp || '0.0.0.0') as string;
      const charge = await BillingService.createNoShowCharge(req.body, userId, ip);
      res.status(201).json({ success: true, data: charge, message: 'No-show charge created successfully' });
    } catch (error) { next(error); }
  }
}
