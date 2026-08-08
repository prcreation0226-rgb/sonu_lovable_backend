// Radiantilyk EMR — Central Backend Availability Service
// Central source of truth for Public Website, Staff Booking, Admin Booking, Calendar, and Reschedule.

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { LIVE_SERVICES } from '../data/fullCatalogData';
import { authenticate } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

/** Default master clinic hours if database has no rows configured for a day */
const DEFAULT_CLINIC_HOURS: Record<number, { startTime: string; endTime: string; isOpen: boolean }> = {
  1: { startTime: '09:00', endTime: '18:00', isOpen: true },  // Mon
  2: { startTime: '09:00', endTime: '18:00', isOpen: true },  // Tue
  3: { startTime: '09:00', endTime: '18:00', isOpen: true },  // Wed
  4: { startTime: '09:00', endTime: '18:00', isOpen: true },  // Thu
  5: { startTime: '09:00', endTime: '18:00', isOpen: true },  // Fri
  6: { startTime: '09:00', endTime: '18:00', isOpen: false }, // Sat: closed
  0: { startTime: '09:00', endTime: '18:00', isOpen: false }, // Sun: closed
};

/** Parse "HH:MM" into total minutes from midnight */
function parseHHMM(s: string): number {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Format Date object as "YYYY-MM-DD" */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build an array of Dates from `start` for `days` days. */
function dateRange(start: Date, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(d);
  }
  return out;
}

/** Resolve total service duration in minutes from DB or static catalog (SUM of all selected service durations). */
async function resolveTotalServiceDuration(serviceIds: string[]): Promise<number> {
  if (!serviceIds || serviceIds.length === 0) return 30;

  try {
    const dbServices = await prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true, deletedAt: null },
      select: { durationMinutes: true },
    });
    if (dbServices.length > 0) {
      const sum = dbServices.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
      if (sum > 0) return sum;
    }
  } catch (err) {
    console.warn('Error resolving DB service duration:', err);
  }

  // Fallback to static catalog data
  let fallbackSum = 0;
  for (const sid of serviceIds) {
    const match = LIVE_SERVICES.find(s => s.id === sid);
    if (match) fallbackSum += match.duration_minutes;
  }
  return fallbackSum || 30;
}

/** Fetch Master Clinic Hours for a day-of-week (0=Sun...6=Sat) */
async function getMasterClinicHours(dayOfWeek: number): Promise<{ startTime: string; endTime: string; isOpen: boolean }> {
  try {
    const dbRow = await prisma.clinicBookingHours.findFirst({
      where: { dayOfWeek },
    });
    if (dbRow) {
      return {
        startTime: dbRow.startTime,
        endTime: dbRow.endTime,
        isOpen: dbRow.isOpen,
      };
    }
  } catch (err) {
    console.warn('Error fetching clinic booking hours:', err);
  }
  return DEFAULT_CLINIC_HOURS[dayOfWeek] ?? { startTime: '09:00', endTime: '18:00', isOpen: false };
}

/** Check if a date string YYYY-MM-DD is a closed holiday */
async function isDateHoliday(dateStr: string): Promise<boolean> {
  try {
    const holiday = await prisma.clinicHoliday.findFirst({
      where: { date: dateStr, isClosed: true },
    });
    return !!holiday;
  } catch (err) {
    console.warn('Error checking clinic holiday:', err);
    return false;
  }
}

/** Fetch booked appointment windows for a specific date + staff/location. */
async function getBookedRanges(
  dateStr: string,
  staffId: string | null,
  locationId: string | null,
  excludeAppointmentId?: string | null
): Promise<{ startMin: number; endMin: number }[]> {
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  try {
    const where: any = {
      startAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW', 'RESCHEDULED'] },
      deletedAt: null,
    };
    if (staffId && staffId !== 'any-available') where.staffId = staffId;
    if (locationId) where.locationId = locationId;
    if (excludeAppointmentId) where.id = { not: excludeAppointmentId };

    const appts = await prisma.appointment.findMany({
      where,
      select: { startAt: true, endAt: true },
    });

    return appts.map(a => {
      const s = new Date(a.startAt);
      const e = new Date(a.endAt);
      return {
        startMin: s.getHours() * 60 + s.getMinutes(),
        endMin: e.getHours() * 60 + e.getMinutes(),
      };
    });
  } catch (err) {
    console.warn('Error fetching booked appointments:', err);
    return [];
  }
}

/** Fetch staff time-off intervals for a date */
async function getStaffTimeOffRanges(staffId: string | null, dateStr: string): Promise<{ startMin: number; endMin: number }[] | 'ALL_DAY'> {
  if (!staffId || staffId === 'any-available') return [];
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    const timeOffs = await prisma.staffTimeOff.findMany({
      where: {
        staffId,
        startDate: { lte: d },
        endDate: { gte: d },
        status: { not: 'denied' },
      },
    });
    if (timeOffs.length > 0) {
      return 'ALL_DAY';
    }
  } catch (err) {
    console.warn('Error checking staff time off:', err);
  }
  return [];
}

/** Generate central 30-minute start slots for a date */
export async function calculateCentralSlots(
  dateStr: string,
  totalDurationMin: number,
  staffId: string | null = null,
  locationId: string | null = null,
  excludeAppointmentId: string | null = null
): Promise<string[]> {
  const d = new Date(`${dateStr}T12:00:00`);
  const dayOfWeek = d.getDay(); // 0=Sun … 6=Sat

  // 1. Holiday Check
  const closedHoliday = await isDateHoliday(dateStr);
  if (closedHoliday) return [];

  // 2. Master Clinic Hours Check
  const masterHours = await getMasterClinicHours(dayOfWeek);
  if (!masterHours.isOpen) return [];

  let startMin = parseHHMM(masterHours.startTime);
  let endMin = parseHHMM(masterHours.endTime);

  // 3. Provider Availability Check
  if (staffId && staffId !== 'any-available') {
    try {
      const staffAvailRows = await prisma.staffAvailability.findMany({
        where: { staffId },
      });
      if (staffAvailRows.length > 0) {
        const dayRow = staffAvailRows.find(r => r.dayOfWeek === dayOfWeek && (!locationId || !r.locationId || r.locationId === locationId));
        if (!dayRow) {
          // Provider does not work on this day
          return [];
        }
        const provStart = parseHHMM(dayRow.startTime);
        const provEnd = parseHHMM(dayRow.endTime);
        startMin = Math.max(startMin, provStart);
        endMin = Math.min(endMin, provEnd);
      }
    } catch (err) {
      console.warn('Error checking staff availability:', err);
    }

    // 4. Staff Time-Off Check
    const timeOff = await getStaffTimeOffRanges(staffId, dateStr);
    if (timeOff === 'ALL_DAY') return [];
  }

  // 5. Existing Booked Appointments
  const booked = await getBookedRanges(dateStr, staffId, locationId, excludeAppointmentId);

  // 6. Generate 30-Minute Grid Start Slots
  const slots: string[] = [];
  const STEP = 30; // 30 MINUTES START-TIME GRID

  const today = new Date();
  const todayStr = ymd(today);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  for (let m = startMin; m < endMin; m += STEP) {
    // Skip past times today
    if (dateStr === todayStr && m <= nowMinutes) continue;

    // Requirement 10: Complete treatment duration MUST fit before closing time
    const slotEnd = m + totalDurationMin;
    if (slotEnd > endMin) continue;

    // Requirement 9: Overlap Rule candidateStart < existingEnd AND candidateEnd > existingStart
    const overlaps = booked.some(b => m < b.endMin && slotEnd > b.startMin);
    if (overlaps) continue;

    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${dateStr}T${hh}:${mm}:00`);
  }

  return slots;
}

// ─── API Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/get-availability-range
 */
router.post('/get-availability-range', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serviceIds = [], staffId = null, locationId = null, days = 180 } = req.body || {};

    const totalDurationMin = await resolveTotalServiceDuration(serviceIds);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dates = dateRange(tomorrow, Math.min(days, 180));

    const availableDates: string[] = [];
    let nextAvailable: { date: string; slot: string } | null = null;

    for (const d of dates) {
      const ds = ymd(d);
      const slots = await calculateCentralSlots(ds, totalDurationMin, staffId, locationId);
      if (slots.length > 0) {
        availableDates.push(ds);
        if (!nextAvailable) {
          nextAvailable = { date: ds, slot: slots[0] };
        }
      }
    }

    res.json({
      success: true,
      data: { availableDates, nextAvailable },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/get-availability
 */
router.post('/get-availability', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serviceIds = [], staffId = null, locationId = null, date, excludeAppointmentId = null } = req.body || {};

    if (!date) {
      res.status(400).json({ success: false, error: 'Missing required "date" parameter (YYYY-MM-DD)' });
      return;
    }

    const totalDurationMin = await resolveTotalServiceDuration(serviceIds);
    const slots = await calculateCentralSlots(date, totalDurationMin, staffId, locationId, excludeAppointmentId);

    res.json({
      success: true,
      data: { slots, durationMinutes: totalDurationMin },
      slots, // compatibility top-level key
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/clinic-hours — Get weekly booking hours & holidays
 */
router.get('/v1/clinic-hours', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [hours, holidays] = await Promise.all([
      prisma.clinicBookingHours.findMany({ orderBy: { dayOfWeek: 'asc' } }),
      prisma.clinicHoliday.findMany({ orderBy: { date: 'asc' } }),
    ]);
    res.json({ success: true, data: { hours, holidays } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/clinic-hours — Update weekly booking hours for a day (Admin ONLY)
 */
router.post('/v1/clinic-hours', authenticate, requireRoles('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { dayOfWeek, startTime, endTime, isOpen } = req.body || {};
    if (dayOfWeek === undefined) {
      res.status(400).json({ success: false, error: 'dayOfWeek is required' });
      return;
    }
    const updated = await prisma.clinicBookingHours.upsert({
      where: { dayOfWeek: Number(dayOfWeek) },
      update: {
        startTime: startTime || '09:00',
        endTime: endTime || '18:00',
        isOpen: isOpen !== undefined ? Boolean(isOpen) : true,
      },
      create: {
        dayOfWeek: Number(dayOfWeek),
        startTime: startTime || '09:00',
        endTime: endTime || '18:00',
        isOpen: isOpen !== undefined ? Boolean(isOpen) : true,
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/clinic-holidays — Add a closed date/holiday (Admin ONLY)
 */
router.post('/v1/clinic-holidays', authenticate, requireRoles('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { date, name, isClosed = true } = req.body || {};
    if (!date) {
      res.status(400).json({ success: false, error: 'date (YYYY-MM-DD) is required' });
      return;
    }
    const holiday = await prisma.clinicHoliday.upsert({
      where: { date },
      update: { name, isClosed: Boolean(isClosed) },
      create: { date, name, isClosed: Boolean(isClosed) },
    });
    res.json({ success: true, data: holiday });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/clinic-holidays/:id — Delete a holiday (Admin ONLY)
 */
router.delete('/v1/clinic-holidays/:id', authenticate, requireRoles('admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.clinicHoliday.delete({ where: { id: String(id) } });
    res.json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
