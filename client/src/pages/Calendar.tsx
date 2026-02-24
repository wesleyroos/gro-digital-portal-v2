import { trpc } from "@/lib/trpc";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { useMemo } from "react";

function getWindowDates() {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
  return { timeMin, timeMax };
}

export default function Calendar() {
  const { timeMin, timeMax } = useMemo(getWindowDates, []);

  const { data: events, isLoading, error } = trpc.calendar.events.useQuery(
    { timeMin, timeMax },
    { retry: false },
  );

  const isNotConfigured =
    error?.message?.includes("not configured") || error?.message?.includes("not connected");

  if (isNotConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
        <p className="text-lg font-medium">Calendar not connected</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Connect your Google account in <a href="/settings" className="underline underline-offset-2">Settings</a> and ensure <code className="text-xs bg-muted px-1 py-0.5 rounded">GOOGLE_CALENDAR_ID</code> is set.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-destructive">Failed to load calendar events.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-6">Calendar</h1>

      {isLoading ? (
        <div className="h-[600px] rounded-xl border bg-muted/20 animate-pulse" />
      ) : (
        <div className="rounded-xl border bg-background p-4 shadow-sm">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,listWeek",
            }}
            events={events ?? []}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            nowIndicator
          />
        </div>
      )}
    </div>
  );
}
