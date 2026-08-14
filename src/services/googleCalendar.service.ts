// Radiantilyk EMR — Centralized Google Calendar Sync & OAuth Service (R-03)
// Manages Google OAuth authorization flow, refresh token handling, PHI-safe event creation,
// rescheduling updates, cancellation deletion, duplicate event prevention, and audit trail.
//
// Security & Compliance Controls:
// 1. Secrets Backend-Only: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET loaded from process.env only.
// 2. Token Security: Access and Refresh tokens stored securely on server side. NEVER exposed to frontend/logs.
// 3. PHI-Safe Event Details: Calendar events use neutral titles ("Appointment — Radiantilyk MedSpa")
//    and neutral description. NO medical conditions, procedures, or PHI are included in calendar payloads.
// 4. Fail-Safe Operations: If Google OAuth is unconfigured or offline, appointment operations remain valid.

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { writeAuditLog } from '../middleware/audit';

export class GoogleCalendarService {
  private static get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID || '';
  }

  private static get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET || '';
  }

  private static get redirectUri(): string {
    return process.env.GOOGLE_REDIRECT_URI || 'https://app.radiantilykmedspa.com/api/v1/compliance/google-calendar/callback';
  }

  /**
   * Check if Google OAuth Client Credentials are configured in environment.
   */
  static isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Generate Google OAuth Authorization URL for staff calendar connection.
   */
  static getAuthUrl(staffId: string): string {
    if (!this.clientId) {
      throw AppError.badRequest('Google Calendar integration credentials not configured on server.');
    }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events');
    const state = encodeURIComponent(JSON.stringify({ staffId, ts: Date.now() }));
    const redirect = encodeURIComponent(this.redirectUri);

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  }

  /**
   * Exchange OAuth callback authorization code for refresh & access tokens.
   */
  static async handleOAuthCallback(code: string, staffId: string, actingUserId: string, ipAddress: string): Promise<any> {
    if (!this.isConfigured()) {
      throw AppError.badRequest('Google OAuth is not configured on server.');
    }

    const bodyParams = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[GOOGLE_CALENDAR] OAuth token exchange failed: ${errorText}`);
      throw AppError.badRequest('Failed to exchange authorization code with Google');
    }

    const data: any = await response.json();
    const refreshToken = data.refresh_token;


    if (!refreshToken) {
      logger.warn(`[GOOGLE_CALENDAR] No refresh token returned for staff ${staffId}`);
    }

    const updatedStaff = await prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        googleRefreshToken: refreshToken || undefined,
        googleCalendarId: 'primary',
        googleCalendarConnectedAt: new Date(),
      },
    });

    await writeAuditLog({
      userId: actingUserId,
      action: 'CALENDAR_CONNECTED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      newValue: { calendarConnected: true, provider: 'Google Calendar' },
    });

    logger.info(`[GOOGLE_CALENDAR] Successfully connected Google Calendar for staff ${staffId}`);
    return {
      success: true,
      staffId: updatedStaff.id,
      calendarConnectedAt: updatedStaff.googleCalendarConnectedAt,
    };
  }

  /**
   * Retrieve valid access token for a staff profile using stored refresh token.
   */
  private static async getAccessToken(staffId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const staff = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      select: { googleRefreshToken: true },
    });

    if (!staff || !staff.googleRefreshToken) return null;

    try {
      const bodyParams = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: staff.googleRefreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        logger.error(`[GOOGLE_CALENDAR] Failed to refresh access token for staff ${staffId}`);
        return null;
      }

      const data: any = await response.json();
      return data.access_token || null;
    } catch (err: any) {
      logger.error(`[GOOGLE_CALENDAR] Error refreshing access token: ${err.message}`);
      return null;
    }
  }

  /**
   * Sync newly created appointment to Google Calendar (PHI-Safe).
   */
  static async syncAppointmentCreated(appointmentId: string, actingUserId?: string): Promise<{ synced: boolean; googleEventId?: string; reason?: string }> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        staff: true,
        location: true,
      },
    });

    if (!appointment) return { synced: false, reason: 'APPOINTMENT_NOT_FOUND' };

    // Prevent duplicate event creation if already synced
    if (appointment.googleEventId) {
      return this.syncAppointmentUpdated(appointmentId, actingUserId);
    }

    const accessToken = await this.getAccessToken(appointment.staffId);
    if (!accessToken) {
      await writeAuditLog({
        userId: actingUserId || 'SYSTEM',
        action: 'CALENDAR_SYNC_FAILED',
        resourceType: 'appointment',
        resourceId: appointmentId,
        ipAddress: '0.0.0.0',
        newValue: { reason: 'Google Calendar not connected or credentials unconfigured' },
      });
      return { synced: false, reason: 'GOOGLE_NOT_CONFIGURED' };
    }

    const calendarId = appointment.staff.googleCalendarId || 'primary';
    const eventPayload = {
      summary: 'Appointment — Radiantilyk MedSpa',
      description: `Confirmed appointment at Radiantilyk MedSpa (${appointment.location.name}). For details or modifications, please contact clinic staff.`,
      start: { dateTime: appointment.startAt.toISOString() },
      end: { dateTime: appointment.endAt.toISOString() },
      location: `${appointment.location.name}, ${appointment.location.city}`,
    };

    try {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[GOOGLE_CALENDAR] Event creation failed for appointment ${appointmentId}: ${errText}`);
        return { synced: false, reason: 'GOOGLE_API_ERROR' };
      }

      const googleEvent: any = await response.json();


      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleEventId: googleEvent.id,
          googleSyncedAt: new Date(),
        },
      });

      await writeAuditLog({
        userId: actingUserId || 'SYSTEM',
        action: 'CALENDAR_EVENT_CREATED',
        resourceType: 'appointment',
        resourceId: appointmentId,
        ipAddress: '0.0.0.0',
        newValue: { googleEventId: googleEvent.id, status: 'synced' },
      });

      logger.info(`[GOOGLE_CALENDAR] Created Google Calendar event ${googleEvent.id} for appointment ${appointmentId}`);
      return { synced: true, googleEventId: googleEvent.id };
    } catch (err: any) {
      logger.error(`[GOOGLE_CALENDAR] Error syncing created appointment ${appointmentId}: ${err.message}`);
      return { synced: false, reason: err.message };
    }
  }

  /**
   * Sync updated / rescheduled appointment to Google Calendar (PHI-Safe).
   */
  static async syncAppointmentUpdated(appointmentId: string, actingUserId?: string): Promise<{ synced: boolean; googleEventId?: string; reason?: string }> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true, location: true },
    });

    if (!appointment) return { synced: false, reason: 'APPOINTMENT_NOT_FOUND' };

    // Duplicate Prevention: If no event exists yet, create one instead of failing
    if (!appointment.googleEventId) {
      return this.syncAppointmentCreated(appointmentId, actingUserId);
    }

    const accessToken = await this.getAccessToken(appointment.staffId);
    if (!accessToken) return { synced: false, reason: 'GOOGLE_NOT_CONFIGURED' };

    const calendarId = appointment.staff.googleCalendarId || 'primary';
    const eventPayload = {
      summary: 'Appointment — Radiantilyk MedSpa',
      description: `Rescheduled appointment at Radiantilyk MedSpa (${appointment.location.name}). For details, please contact clinic staff.`,
      start: { dateTime: appointment.startAt.toISOString() },
      end: { dateTime: appointment.endAt.toISOString() },
    };

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appointment.googleEventId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        }
      );

      if (!response.ok) {
        logger.error(`[GOOGLE_CALENDAR] Event update failed for event ${appointment.googleEventId}`);
        return { synced: false, reason: 'GOOGLE_API_ERROR' };
      }

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { googleSyncedAt: new Date() },
      });

      await writeAuditLog({
        userId: actingUserId || 'SYSTEM',
        action: 'CALENDAR_EVENT_UPDATED',
        resourceType: 'appointment',
        resourceId: appointmentId,
        ipAddress: '0.0.0.0',
        newValue: { googleEventId: appointment.googleEventId, status: 'updated' },
      });

      logger.info(`[GOOGLE_CALENDAR] Updated Google Calendar event ${appointment.googleEventId} for appointment ${appointmentId}`);
      return { synced: true, googleEventId: appointment.googleEventId };
    } catch (err: any) {
      logger.error(`[GOOGLE_CALENDAR] Error updating appointment event: ${err.message}`);
      return { synced: false, reason: err.message };
    }
  }

  /**
   * Sync cancelled appointment to Google Calendar by deleting event.
   */
  static async syncAppointmentCancelled(appointmentId: string, actingUserId?: string): Promise<{ cancelled: boolean; reason?: string }> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { staff: true },
    });

    if (!appointment || !appointment.googleEventId) {
      return { cancelled: true, reason: 'NO_GOOGLE_EVENT' };
    }

    const accessToken = await this.getAccessToken(appointment.staffId);
    if (!accessToken) return { cancelled: false, reason: 'GOOGLE_NOT_CONFIGURED' };

    const calendarId = appointment.staff.googleCalendarId || 'primary';
    const eventId = appointment.googleEventId;

    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { googleEventId: null, googleSyncedAt: new Date() },
      });

      await writeAuditLog({
        userId: actingUserId || 'SYSTEM',
        action: 'CALENDAR_EVENT_CANCELLED',
        resourceType: 'appointment',
        resourceId: appointmentId,
        ipAddress: '0.0.0.0',
        newValue: { googleEventId: eventId, status: 'cancelled' },
      });

      logger.info(`[GOOGLE_CALENDAR] Cancelled Google Calendar event ${eventId} for appointment ${appointmentId}`);
      return { cancelled: true };
    } catch (err: any) {
      logger.error(`[GOOGLE_CALENDAR] Error deleting calendar event ${eventId}: ${err.message}`);
      return { cancelled: false, reason: err.message };
    }
  }

  /**
   * Disconnect Google Calendar integration for a staff member.
   */
  static async disconnectCalendar(staffId: string, actingUserId: string, ipAddress: string): Promise<any> {
    const updated = await prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        googleRefreshToken: null,
        googleCalendarId: null,
        googleCalendarConnectedAt: null,
      },
    });

    await writeAuditLog({
      userId: actingUserId,
      action: 'CALENDAR_DISCONNECTED',
      resourceType: 'staff_profile',
      resourceId: staffId,
      ipAddress,
      newValue: { calendarConnected: false },
    });

    return { success: true, staffId: updated.id };
  }

  /**
   * Get staff Google Calendar connection status.
   */
  static async getCalendarStatus(staffId: string): Promise<{ connected: boolean; calendarId: string | null; connectedAt: Date | null; isServerConfigured: boolean }> {
    const staff = await prisma.staffProfile.findUnique({
      where: { id: staffId },
      select: {
        googleRefreshToken: true,
        googleCalendarId: true,
        googleCalendarConnectedAt: true,
      },
    });

    return {
      connected: Boolean(staff && staff.googleRefreshToken),
      calendarId: staff?.googleCalendarId || null,
      connectedAt: staff?.googleCalendarConnectedAt || null,
      isServerConfigured: this.isConfigured(),
    };
  }
}
