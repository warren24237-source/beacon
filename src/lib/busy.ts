import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

import { fmtMinutes, parseYmd } from './polls';

// Reads the phone's own calendar (which already syncs Google, Outlook and so on)
// to see which dates clash with a "Find a date" time window. Nothing leaves the phone.

export type DayCheck = { busy: string[]; allDay: string[] };

// Screenshots in a browser can pass fake calendar results here.
const fake = () => (globalThis as { __beaconFakeBusy?: Record<string, DayCheck> }).__beaconFakeBusy;

export async function calendarAllowed(): Promise<boolean> {
  if (Platform.OS === 'web') return !!fake();
  try {
    return (await Calendar.getCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

export async function askCalendar(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Calendar.requestCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

function at(day: string, minute: number): Date {
  const d = parseYmd(day);
  d.setHours(0, minute, 0, 0);
  return d;
}

/** For each date: timed events that overlap the window, and all-day events (shown, not counted as busy). */
export async function checkDates(dates: string[], startMinute: number | null, endMinute: number | null): Promise<Record<string, DayCheck> | null> {
  if (!dates.length) return {};
  if (Platform.OS === 'web') return fake() ?? null;
  try {
    const calendars = await Calendar.getCalendars();
    if (!calendars.length) return {};
    const from = at(dates[0], 0);
    const to = at(dates[dates.length - 1], 24 * 60);
    const events = await Calendar.listEvents(calendars, from, to);
    const out: Record<string, DayCheck> = {};
    for (const day of dates) {
      const wStart = at(day, startMinute ?? 0);
      const wEnd = at(day, endMinute ?? 24 * 60);
      const dayStart = at(day, 0);
      const dayEnd = at(day, 24 * 60);
      const check: DayCheck = { busy: [], allDay: [] };
      for (const e of events) {
        const s = new Date(e.startDate);
        const f = new Date(e.endDate);
        if (e.allDay) {
          // All-day events are stored as UTC midnights; compare on the date only.
          const sd = new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
          const fd = new Date(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
          if (sd <= dayStart && fd > dayStart) check.allDay.push(e.title || 'All-day event');
          continue;
        }
        if (s < wEnd && f > wStart && s < dayEnd && f > dayStart) {
          const label = s >= dayStart ? `${e.title || 'Busy'} ${fmtMinutes(s.getHours() * 60 + s.getMinutes())}` : e.title || 'Busy';
          check.busy.push(label);
        }
      }
      out[day] = check;
    }
    return out;
  } catch {
    return null;
  }
}
