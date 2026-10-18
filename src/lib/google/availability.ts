import "server-only";

import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";
import { userTimeZone } from "@/lib/time-zone";

import { googleConnection } from "./account";
import { busyTimes, createEvent } from "./calendar";
import { GoogleError } from "./errors";
import { freeSlots, type Interval, type WorkingHours } from "./slots";

// The calendar side (E15-5): free times to offer an employer, and agreed
// interviews added to the calendar and the dashboard.

/** The working hours in Settings → Google, in the saved time zone or else the browser's. */
export async function workingHours(): Promise<WorkingHours> {
  const settings = await loadSettings();
  const timeZone = settings.workTimeZone ?? (await userTimeZone()) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    days: settings.workDays,
    start: settings.workStart,
    end: settings.workEnd,
    timeZone,
    slotMinutes: settings.slotMinutes,
    bufferMinutes: settings.bufferMinutes,
  };
}

/** Free times over the next two weeks; empty while the calendar isn't in use. */
export async function proposeSlots(now = new Date()): Promise<{ slots: Interval[]; timeZone: string; fromCalendar: boolean }> {
  const [hours, settings, connection] = await Promise.all([workingHours(), loadSettings(), googleConnection()]);
  const useCalendar = connection.status === "connected" && connection.canUseCalendar && settings.calendarAvailability;
  if (!useCalendar) return { slots: [], timeZone: hours.timeZone, fromCalendar: false };
  const until = new Date(now.getTime() + 14 * 86_400_000);
  const busy = await busyTimes(settings.calendarId, now, until);
  return { slots: freeSlots(busy, hours, { from: now, days: 14 }), timeZone: hours.timeZone, fromCalendar: true };
}

/**
 * Puts an agreed interview on the dashboard (the application's next
 * interview) and, when allowed, in the calendar. Returns the event's link.
 */
export async function scheduleInterview(applicationId: string, start: Date): Promise<{ eventLink: string | null }> {
  const application = await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true, company: true, role: true, title: true } });
  if (!application) throw new GoogleError("unavailable", "That application no longer exists.");
  const [hours, settings, connection] = await Promise.all([workingHours(), loadSettings(), googleConnection()]);
  await prisma.application.update({ where: { id: applicationId }, data: { nextInterviewAt: start } });

  if (connection.status !== "connected" || !connection.canUseCalendar || !settings.calendarEvents) return { eventLink: null };
  const what = [application.role || application.title, application.company].filter(Boolean).join(" · ");
  const event = await createEvent(settings.calendarId, {
    summary: `Interview · ${what || "application"}`,
    description: `Added by Dossier for your application${application.company ? ` to ${application.company}` : ""}.`,
    start,
    end: new Date(start.getTime() + hours.slotMinutes * 60_000),
    timeZone: hours.timeZone,
  });
  return { eventLink: event.htmlLink };
}
