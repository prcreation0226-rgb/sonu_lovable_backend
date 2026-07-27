// Radiantilyk EMR — Billing & Payments Service
// Business logic for Invoices, Payments, Refunds, PatientCredits, and NoShowCharges.
//
// PCI Compliance:
// 1. No raw card data stored — only Stripe payment/refund IDs
// 2. No PHI in Stripe metadata — only invoice ID and amount
// 3. Financial records use soft-delete (deletedAt)
// 4. Invoice prices locked at creation time

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import {
  CreateInvoiceInput,
  RecordPaymentInput,
  CreateRefundInput,
  CreatePatientCreditInput,
  CreateNoShowChargeInput,
} from '../schemas/billing.schema';

export class BillingService {
  // ==========================================
  // ---- INVOICES ----
  // ==========================================

  static async createInvoice(input: CreateInvoiceInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    // Calculate totals from items (prices locked at creation time)
    const subtotalCents = input.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const totalCents = subtotalCents + input.taxCents - input.discountCents;

    if (totalCents < 0) throw AppError.badRequest('Invoice total cannot be negative');

    const invoice = await prisma.invoice.create({
      data: {
        patientId: input.patientId,
        appointmentId: input.appointmentId || undefined,
        subtotalCents,
        discountCents: input.discountCents,
        taxCents: input.taxCents,
        totalCents,
        status: 'unpaid',
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        invoiceItems: {
          create: input.items.map((item) => ({
            serviceId: item.serviceId || undefined,
            productId: item.productId || undefined,
            description: item.description,
            unitPriceCents: item.unitPriceCents,
            quantity: item.quantity,
            totalCents: item.unitPriceCents * item.quantity,
          })),
        },
      },
      include: {
        invoiceItems: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'INVOICE_CREATED',
      resourceType: 'invoice',
      resourceId: invoice.id,
      ipAddress,
      newValue: { totalCents, itemCount: input.items.length },
    });

    return invoice;
  }

  static async getInvoices(page: number = 1, perPage: number = 25) {
    const skip = (page - 1) * perPage;

    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: perPage,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          invoiceItems: { select: { id: true, description: true, totalCents: true } },
          _count: { select: { payments: true } },
        },
      }),
      prisma.invoice.count({ where: { deletedAt: null } }),
    ]);

    return {
      invoices,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  static async getInvoiceById(invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        invoiceItems: {
          include: {
            service: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
          },
        },
        payments: {
          include: {
            refunds: true,
            processor: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    return invoice;
  }

  static async getPatientInvoices(patientId: string) {
    return prisma.invoice.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        invoiceItems: { select: { id: true, description: true, totalCents: true } },
        _count: { select: { payments: true } },
      },
    });
  }

  // ==========================================
  // ---- PAYMENTS ----
  // ==========================================

  static async recordPayment(input: RecordPaymentInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    // If linked to an invoice, validate and update invoice status
    let invoice = null;
    if (input.invoiceId) {
      invoice = await prisma.invoice.findFirst({ where: { id: input.invoiceId, deletedAt: null } });
      if (!invoice) throw AppError.notFound('Invoice');
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId: input.invoiceId || undefined,
        patientId: input.patientId,
        appointmentId: input.appointmentId || undefined,
        amountCents: input.amountCents,
        tipCents: input.tipCents,
        discountCents: input.discountCents,
        paymentMethod: input.paymentMethod,
        stripePaymentId: input.stripePaymentId || undefined,
        status: 'completed',
        processedBy: staffProfile.id,
      },
      include: {
        processor: { select: { id: true, fullName: true } },
      },
    });

    // Update invoice status if linked
    if (invoice) {
      const totalPaid = await prisma.payment.aggregate({
        where: { invoiceId: invoice.id, status: 'completed' },
        _sum: { amountCents: true },
      });

      const paidAmount = totalPaid._sum.amountCents || 0;
      const newStatus = paidAmount >= invoice.totalCents ? 'paid' : 'partial';

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });
    }

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'PAYMENT_RECORDED',
      resourceType: 'payment',
      resourceId: payment.id,
      ipAddress,
      newValue: { amountCents: input.amountCents, paymentMethod: input.paymentMethod },
    });

    return payment;
  }

  // ==========================================
  // ---- REFUNDS ----
  // ==========================================

  static async createRefund(input: CreateRefundInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
    if (!payment) throw AppError.notFound('Payment');

    // Validate refund amount doesn't exceed payment
    const existingRefunds = await prisma.refund.aggregate({
      where: { paymentId: input.paymentId },
      _sum: { amountCents: true },
    });
    const totalRefunded = existingRefunds._sum.amountCents || 0;

    if (totalRefunded + input.amountCents > payment.amountCents) {
      throw AppError.badRequest(
        `Refund amount (${input.amountCents}) exceeds remaining refundable amount (${payment.amountCents - totalRefunded})`
      );
    }

    const [refund] = await prisma.$transaction([
      prisma.refund.create({
        data: {
          paymentId: input.paymentId,
          amountCents: input.amountCents,
          reason: input.reason,
          stripeRefundId: input.stripeRefundId || undefined,
          processedBy: staffProfile.id,
        },
      }),
      prisma.payment.update({
        where: { id: input.paymentId },
        data: {
          refundAmountCents: { increment: input.amountCents },
          status: totalRefunded + input.amountCents >= payment.amountCents ? 'refunded' : 'partial_refund',
        },
      }),
    ]);

    // If payment was linked to an invoice, revert invoice status
    if (payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'unpaid' },
      });
    }

    await writeAuditLog({
      userId,
      patientId: payment.patientId,
      action: 'REFUND_PROCESSED',
      resourceType: 'refund',
      resourceId: refund.id,
      ipAddress,
      newValue: { amountCents: input.amountCents, reason: input.reason },
    });

    return refund;
  }

  // ==========================================
  // ---- PATIENT CREDITS ----
  // ==========================================

  static async createCredit(input: CreatePatientCreditInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const credit = await prisma.patientCredit.create({
      data: {
        patientId: input.patientId,
        amountCents: input.amountCents,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        createdBy: staffProfile.id,
      },
    });

    await writeAuditLog({
      userId,
      patientId: input.patientId,
      action: 'PATIENT_CREDIT_ISSUED',
      resourceType: 'patient_credit',
      resourceId: credit.id,
      ipAddress,
      newValue: { amountCents: input.amountCents, reason: input.reason },
    });

    return credit;
  }

  static async getPatientCredits(patientId: string) {
    return prisma.patientCredit.findMany({
      where: {
        patientId,
        usedAt: null, // Only unused credits
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // ---- NO-SHOW CHARGES ----
  // ==========================================

  static async createNoShowCharge(input: CreateNoShowChargeInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });

    const appointment = await prisma.appointment.findUnique({ where: { id: input.appointmentId } });
    if (!appointment) throw AppError.notFound('Appointment');

    // Check if no-show charge already exists for this appointment
    const existing = await prisma.noShowCharge.findUnique({ where: { appointmentId: input.appointmentId } });
    if (existing) throw AppError.conflict('No-show charge already exists for this appointment');

    const charge = await prisma.noShowCharge.create({
      data: {
        appointmentId: input.appointmentId,
        patientId: appointment.patientId,
        amountCents: input.amountCents,
        paymentMethodId: input.paymentMethodId || undefined,
        status: 'pending',
        chargedBy: staffProfile?.id || undefined,
      },
    });

    await writeAuditLog({
      userId,
      patientId: appointment.patientId,
      action: 'NO_SHOW_CHARGE_CREATED',
      resourceType: 'no_show_charge',
      resourceId: charge.id,
      ipAddress,
      newValue: { amountCents: input.amountCents, appointmentId: input.appointmentId },
    });

    return charge;
  }
}
