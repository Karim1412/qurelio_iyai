import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export interface CreatedMeeting {
  meetingLink: string;
  calendarEventId: string;
}

/**
 * Creates the Google Calendar event that carries the Meet link for a confirmed demo.
 *
 * Auth is OAuth2 with a stored refresh token rather than a service account: a
 * service account needs domain-wide delegation, which only exists on Google
 * Workspace. A refresh token works with an ordinary Gmail account, so this costs
 * nothing: the Calendar API itself is free, subject to daily quota.
 *
 * Every failure here is non-fatal by design. Confirming a demo must succeed even
 * if Google is misconfigured, rate-limited or down; the admin can still paste a
 * link manually. Callers get `null` and carry on.
 */
@Injectable()
export class GoogleMeetService implements OnModuleInit {
  private readonly logger = new Logger(GoogleMeetService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Say at boot whether links can be generated.
   *
   * Without this the feature fails silently: confirmations go out with no join
   * link and nothing explains why, which reads as a bug rather than as missing
   * configuration.
   */
  onModuleInit() {
    if (this.isConfigured()) {
      this.logger.log(
        `Google Meet: configured (calendar "${this.cfg('GOOGLE_CALENDAR_ID') || 'primary'}"), confirmations will carry a Meet link`,
      );
      return;
    }
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter(
      (k) => !this.cfg(k),
    );
    this.logger.warn(
      `Google Meet: OFF: missing ${missing.join(', ')}. Demos still confirm and email, ` +
        'but with no join link unless the admin pastes one.',
    );
  }

  private cfg(key: string): string {
    return this.config.get<string>(key)?.trim() ?? '';
  }

  /** True when all three OAuth values are present. */
  isConfigured(): boolean {
    return (
      !!this.cfg('GOOGLE_CLIENT_ID') &&
      !!this.cfg('GOOGLE_CLIENT_SECRET') &&
      !!this.cfg('GOOGLE_REFRESH_TOKEN')
    );
  }

  private client() {
    const oauth2 = new google.auth.OAuth2(
      this.cfg('GOOGLE_CLIENT_ID'),
      this.cfg('GOOGLE_CLIENT_SECRET'),
      // Only used during the one-off consent that mints the refresh token.
      this.cfg('GOOGLE_REDIRECT_URI') || 'https://developers.google.com/oauthplayground',
    );
    oauth2.setCredentials({ refresh_token: this.cfg('GOOGLE_REFRESH_TOKEN') });
    return google.calendar({ version: 'v3', auth: oauth2 });
  }

  /**
   * Create the event and return its Meet link.
   * Returns null when Google is not configured or the call fails.
   */
  async createMeeting(params: {
    summary: string;
    description?: string;
    startsAt: Date;
    durationMinutes: number;
    attendeeEmail?: string | null;
  }): Promise<CreatedMeeting | null> {
    if (!this.isConfigured()) return null;

    const { summary, description, startsAt, durationMinutes, attendeeEmail } = params;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    try {
      const res = await this.client().events.insert({
        calendarId: this.cfg('GOOGLE_CALENDAR_ID') || 'primary',
        // Required for Google to actually mint a conference for the event.
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary,
          description,
          start: { dateTime: startsAt.toISOString(), timeZone: 'UTC' },
          end: { dateTime: endsAt.toISOString(), timeZone: 'UTC' },
          attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
          conferenceData: {
            createRequest: {
              // Must be unique per request; Google dedupes retries on it.
              requestId: `qurelio-demo-${startsAt.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });

      const event = res.data;
      const link =
        event.hangoutLink ||
        event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
        '';

      if (!link || !event.id) {
        this.logger.warn('Calendar event created but carried no Meet link');
        return null;
      }
      this.logger.log(`Google Meet created for ${startsAt.toISOString()} (event ${event.id})`);
      return { meetingLink: link, calendarEventId: event.id };
    } catch (e: any) {
      // Surface enough to diagnose without leaking tokens.
      const detail = e?.response?.data?.error?.message ?? e?.message ?? String(e);
      this.logger.warn(`Google Meet creation failed: ${detail}`);
      return null;
    }
  }

  /** Best-effort cleanup when a confirmed demo is later declined or deleted. */
  async cancelMeeting(calendarEventId: string): Promise<void> {
    if (!this.isConfigured() || !calendarEventId) return;
    try {
      await this.client().events.delete({
        calendarId: this.cfg('GOOGLE_CALENDAR_ID') || 'primary',
        eventId: calendarEventId,
        sendUpdates: 'all',
      });
      this.logger.log(`Google Calendar event ${calendarEventId} cancelled`);
    } catch (e: any) {
      const detail = e?.response?.data?.error?.message ?? e?.message ?? String(e);
      this.logger.warn(`Could not cancel calendar event ${calendarEventId}: ${detail}`);
    }
  }
}
