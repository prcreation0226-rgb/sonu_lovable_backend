// Radiantilyk EMR — Public Booking Availability Router
// Serves slot availability for the public booking calendar (SlotPicker).
// Fast, resilient slot generation with instant DB offline fallback.

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { LIVE_SERVICES } from '../data/fullCatalogData';

const router = Router();

// Track DB connectivity status to prevent repeated timeout delays when offline
let isDbAvailable = true;

/** Default clinic hours when no StaffAvailability rows exist. Mon(1)–Sat(6) 11:30–16:15 */
const DEFAULT_HOURS: Record<number, { start: string; end: string }> = {
  1: { start: '11:30', end: '16:15' }, // Monday
  2: { start: '11:30', end: '16:15' }, // Tuesday
  3: { start: '11:30', end: '16:15' }, // Wednesday
  4: { start: '11:30', end: '16:15' }, // Thursday
  5: { start: '11:30', end: '16:15' }, // Friday
  6: { start: '11:30', end: '16:15' }, // Saturday
  // 0 = Sunday → closed
};

/** Parse "HH:MM" into total minutes from midnight */
function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Format a Date as "YYYY-MM-DD" */
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

/** Resolve the service duration in minutes from DB or static catalog. */
async function resolveServiceDuration(serviceIds: string[]): Promise<number> {
  let total = 0;
  if (isDbAvailable) {
    try {
      const dbServices = await prisma.service.findMany({
        where: { id: { in: serviceIds }, isActive: true },
        select: { durationMinutes: true },
      });
      if (dbServices.length > 0) {
        total = dbServices.reduce((sum, s) => sum + s.durationMinutes, 0);
      }
    } catch {
      isDbAvailable = false;
    }
  }

  if (total === 0) {
    // Fallback to LIVE_SERVICES static data
    for (const sid of serviceIds) {
      const match = LIVE_SERVICES.find(s => s.id === sid);
      if (match) total += match.duration_minutes;
    }
  }

  return total || 30; // absolute fallback: 30 min
}

/** Load staff working-hours for a given day-of-week from the DB, falling back to defaults. */
async function getWorkingHours(
  staffId: string | null,
  locationId: string | null,
  dayOfWeek: number
): Promise<{ start: string; end: string } | null> {
  if (isDbAvailable && staffId && staffId !== 'any-available' && locationId) {
    try {
      const row = await prisma.staffAvailability.findFirst({
        where: { staffId, locationId, dayOfWeek },
      });
      if (row) return { start: row.startTime, end: row.endTime };
    } catch {
      isDbAvailable = false;
    }
  }

  return DEFAULT_HOURS[dayOfWeek] ?? null;
}

/** Fetch booked appointment windows for a specific date + staff (or all staff). */
async function getBookedSlots(
  dateStr: string,
  staffId: string | null,
  locationId: string | null
): Promise<{ startMin: number; endMin: number }[]> {
  if (!isDbAvailable) return [];

  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  try {
    const where: any = {
      startAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      deletedAt: null,
    };
    if (staffId && staffId !== 'any-available') where.staffId = staffId;
    if (locationId) where.locationId = locationId;

    const appts = await prisma.appointment.findMany({
      where,
      select: { startAt: true, endAt: true },
    });

    return appts.map(a => ({
      startMin: a.startAt.getHours() * 60 + a.startAt.getMinutes(),
      endMin: a.endAt.getHours() * 60 + a.endAt.getMinutes(),
    }));
  } catch {
    isDbAvailable = false;
    return [];
  }
}

/** Generate available time-slot ISO strings for a specific date. */
async function generateSlots(
  dateStr: string,
  durationMin: number,
  staffId: string | null,
  locationId: string | null
): Promise<string[]> {
  const d = new Date(`${dateStr}T12:00:00`);
  const dayOfWeek = d.getDay(); // 0=Sun … 6=Sat

  const hours = await getWorkingHours(staffId, locationId, dayOfWeek);
  if (!hours) return []; // closed that day

  const startMin = parseHHMM(hours.start);
  const endMin = parseHHMM(hours.end);

  const booked = await getBookedSlots(dateStr, staffId, locationId);

  const slots: string[] = [];
  const interval = 15; // generate slots every 15 minutes (11:30, 11:45, 12:00, 12:15...)
  const today = new Date();
  const todayStr = ymd(today);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  for (let m = startMin; m + durationMin <= endMin; m += interval) {
    // Skip past times today
    if (dateStr === todayStr && m <= nowMinutes) continue;

    // Check overlap with booked appointments
    const slotEnd = m + durationMin;
    const overlaps = booked.some(b => m < b.endMin && slotEnd > b.startMin);
    if (overlaps) continue;

    // Build ISO string in local timezone
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${dateStr}T${hh}:${mm}:00`);
  }

  return slots;
}

// ─── Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/get-availability-range
 * Body: { serviceIds: string[], staffId: string, locationId: string, days: number }
 * Returns: { availableDates: string[], nextAvailable: { date, slot } | null }
 */
router.post('/get-availability-range', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serviceIds = [], staffId = null, locationId = null, days = 180 } = req.body || {};

    const durationMin = await resolveServiceDuration(serviceIds);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dates = dateRange(tomorrow, Math.min(days, 180));

    const availableDates: string[] = [];
    let nextAvailable: { date: string; slot: string } | null = null;

    for (const d of dates) {
      const ds = ymd(d);
      const slots = await generateSlots(ds, durationMin, staffId, locationId);
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
 * Body: { serviceIds: string[], staffId: string, locationId: string, date: "YYYY-MM-DD" }
 * Returns: { slots: string[] }
 */
router.post('/get-availability', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { serviceIds = [], staffId = null, locationId = null, date } = req.body || {};

    if (!date) {
      res.status(400).json({ success: false, error: 'Missing required "date" parameter (YYYY-MM-DD)' });
      return;
    }

    const durationMin = await resolveServiceDuration(serviceIds);
    const slots = await generateSlots(date, durationMin, staffId, locationId);

    res.json({
      success: true,
      data: { slots },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
