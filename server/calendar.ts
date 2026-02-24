import { google } from "googleapis";
import { getGoogleRefreshToken } from "./db";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
};

export async function getCalendarEvents(
  openId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const tokenData = await getGoogleRefreshToken(openId);
  if (!tokenData) {
    throw new Error("Google Calendar is not connected");
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("Google Calendar is not configured");
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: tokenData.refreshToken });

  const calendar = google.calendar({ version: "v3", auth: client });

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const items = response.data.items ?? [];

  return items
    .filter(event => event.id && (event.start?.dateTime || event.start?.date))
    .map(event => {
      const isAllDay = !event.start?.dateTime;
      const start = event.start?.dateTime ?? event.start?.date ?? "";
      const end = event.end?.dateTime ?? event.end?.date ?? start;

      return {
        id: event.id!,
        title: event.summary ?? "(No title)",
        start,
        end,
        allDay: isAllDay,
        location: event.location ?? undefined,
        description: event.description ?? undefined,
      };
    });
}
