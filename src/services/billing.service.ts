// Radiantilyk EMR — Billing & Payments Service
// Business logic for Invoices, Payments, Refunds, PatientCredits, NoShowCharges, and POS Checkout Transactions.
//
// PCI Compliance:
// 1. No raw card data stored — only Stripe payment/refund IDs
// 2. No PHI in Stripe metadata — only invoice ID and amount
// 3. Financial records use soft-delete (deletedAt)
// 4. Invoice prices locked at creation time

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from '../middleware/audit';
import { AuthenticatedUser } from '../types';
import {
  CreateInvoiceInput,
  RecordPaymentInput,
  CreateRefundInput,
  CreatePatientCreditInput,
  CreateNoShowChargeInput,
  CheckoutTransactionInput,
} from '../schemas/billing.schema';

export class BillingService {
  // ==========================================
  // ---- CHECKOUT TRANSACTION ----
  // ==========================================

  static async checkoutTransaction(input: CheckoutTransactionInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    const processorId = staffProfile?.id;

    let patientId = input.patientId;

    // Resolve patient from appointment if provided
    if (!patientId && input.appointmentId) {
      const appt = await prisma.appointment.findUnique({ where: { id: input.appointmentId } });
      if (appt) patientId = appt.patientId;
    }

    // Resolve or create walk-in patient profile
    if (!patientId) {
      if (input.clientEmail) {
        const existing = await prisma.patientProfile.findFirst({
          where: { email: input.clientEmail, deletedAt: null },
        });
        if (existing) patientId = existing.id;
      }

      if (!patientId) {
        const email = input.clientEmail || `walkin-${Date.now()}@radiantilyk.local`;
        const firstName = input.clientFirstName || 'Walk-In';
        const lastName = input.clientLastName || 'Client';

        const user = await prisma.user.create({
          data: {
            email,
            passwordHash: 'WALK_IN_NOPASS',
            isActive: true,
            userRoles: {
              create: {
                role: { connect: { name: 'patient' } },
              },
            },
          },
        });

        const newPatient = await prisma.patientProfile.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            email,
            phone: input.clientPhone || undefined,
          },
        });
        patientId = newPatient.id;
      }
    }

    const discountCents = input.discountAmountCents ?? input.discountCents ?? 0;
    const tipCents = input.tipAmountCents ?? input.tipCents ?? 0;
    const taxCents = input.taxCents ?? 0;

    const items = input.items.map((item) => ({
      serviceId: item.serviceId || undefined,
      productId: item.productId || undefined,
      description: item.description || item.label || 'Service/Item',
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      totalCents: item.unitPriceCents * item.quantity,
    }));

    const subtotalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
    const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);

    const paymentMethod = input.paymentMethod || 'card';
    const isPaid = input.status === 'paid' || !!paymentMethod;
    const invoiceStatus = isPaid ? 'paid' : 'unpaid';

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Invoice & InvoiceItems
      const invoice = await tx.invoice.create({
        data: {
          patientId: patientId!,
          appointmentId: input.appointmentId || undefined,
          subtotalCents,
          discountCents,
          taxCents,
          totalCents,
          status: invoiceStatus,
          invoiceItems: {
            create: items,
          },
        },
        include: {
          invoiceItems: true,
          patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // 2. Record Payment if payment method provided
      let payment = null;
      if (paymentMethod && processorId) {
        payment = await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            patientId: patientId!,
            appointmentId: input.appointmentId || undefined,
            amountCents: totalCents,
            tipCents,
            discountCents,
            paymentMethod,
            stripePaymentId: input.stripePaymentId || undefined,
            status: 'completed',
            processedBy: processorId,
          },
        });
      }

      // 3. Transition Appointment status to COMPLETED if linked
      if (input.appointmentId) {
        await tx.appointment.update({
          where: { id: input.appointmentId },
          data: { status: 'COMPLETED' },
        });
      }

      return { invoice, payment };
    });

    await writeAuditLog({
      userId,
      patientId,
      action: 'CHECKOUT_COMPLETED',
      resourceType: 'invoice',
      resourceId: result.invoice.id,
      ipAddress,
      newValue: { totalCents, paymentMethod, appointmentId: input.appointmentId },
    });

    return {
      saleId: result.invoice.id,
      id: result.invoice.id,
      invoice: result.invoice,
      payment: result.payment,
      status: invoiceStatus,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
      amountDueCents: invoiceStatus === 'paid' ? 0 : totalCents,
    };
  }

  // ==========================================
  // ---- INVOICES ----
  // ==========================================

  static async createInvoice(input: CreateInvoiceInput, userId: string, ipAddress: string) {
    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

    const subtotalCents = input.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const totalCents = Math.max(0, subtotalCents + input.taxCents - input.discountCents);

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

  static async getInvoiceById(invoiceId: string, user?: AuthenticatedUser) {
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

    // Patient Self-Scoping Check: Patients can only view their own invoice
    if (user && user.roles.includes('patient')) {
      const patientProfile = await prisma.patientProfile.findFirst({ where: { userId: user.id } });
      if (!patientProfile || invoice.patientId !== patientProfile.id) {
        throw AppError.forbidden('Cannot view another patient\'s invoice');
      }
    }

    return invoice;
  }

  static async getPatientInvoices(patientId: string, user?: AuthenticatedUser) {
    // Patient Self-Scoping Check: Patients can only view their own invoice history
    if (user && user.roles.includes('patient')) {
      const patientProfile = await prisma.patientProfile.findFirst({ where: { userId: user.id } });
      if (!patientProfile || patientId !== patientProfile.id) {
        throw AppError.forbidden('Cannot view another patient\'s invoices');
      }
    }

    return prisma.invoice.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        invoiceItems: { select: { id: true, description: true, totalCents: true } },
        _count: { select: { payments: true } },
      },
    });
  }

  static async cancelInvoice(invoiceId: string, userId: string, ipAddress: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
    if (!invoice) throw AppError.notFound('Invoice');

    if (invoice.status === 'paid') {
      throw AppError.badRequest('Cannot cancel a fully paid invoice. Process a refund instead.');
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'cancelled' },
    });

    await writeAuditLog({
      userId,
      patientId: invoice.patientId,
      action: 'INVOICE_CANCELLED',
      resourceType: 'invoice',
      resourceId: invoice.id,
      ipAddress,
      newValue: { previousStatus: invoice.status, status: 'cancelled' },
    });

    return updated;
  }

  // ==========================================
  // ---- PAYMENTS ----
  // ==========================================

  static async recordPayment(input: RecordPaymentInput, userId: string, ipAddress: string) {
    const staffProfile = await prisma.staffProfile.findFirst({ where: { userId } });
    if (!staffProfile) throw AppError.badRequest('Staff profile not found for current user');

    const patient = await prisma.patientProfile.findFirst({ where: { id: input.patientId, deletedAt: null } });
    if (!patient) throw AppError.notFound('Patient');

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

    // Recalculate invoice status without creating false balance due
    if (payment.invoiceId) {
      const inv = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (inv) {
        const totalPaid = await prisma.payment.aggregate({
          where: { invoiceId: inv.id, status: { in: ['completed', 'partial_refund', 'refunded'] } },
          _sum: { amountCents: true },
        });
        const totalRefundedAgg = await prisma.refund.aggregate({
          where: { payment: { invoiceId: inv.id } },
          _sum: { amountCents: true },
        });
        const sumPaid = totalPaid._sum.amountCents || 0;
        const sumRefunded = totalRefundedAgg._sum.amountCents || 0;

        let newStatus: string;
        if (sumRefunded >= sumPaid && sumPaid > 0) {
          newStatus = 'refunded';
        } else if (sumRefunded > 0) {
          newStatus = 'partially_refunded';
        } else if (sumPaid >= inv.totalCents) {
          newStatus = 'paid';
        } else if (sumPaid > 0) {
          newStatus = 'partial';
        } else {
          newStatus = 'unpaid';
        }

        await prisma.invoice.update({
          where: { id: inv.id },
          data: { status: newStatus },
        });
      }
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
        usedAt: null,
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
