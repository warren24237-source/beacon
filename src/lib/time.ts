// Dates, times and wording for beacons. No imports, so the automatic tests can check it directly.

export type Window = { id: string; label: string; start: Date; end: Date };

export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}
export const fmtRange = (a: Date, b: Date) => `${fmtTime(a)} to ${fmtTime(b)}`;

/** Midnight at the start of the day `offset` days from today. */
export function dayStart(offset: number, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function at(day: Date, hours: number, minutes = 0): Date {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The seven days you can light a beacon for (decision 51): today and the next six. */
export function upcomingDays(now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = dayStart(i, now);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()];
    const sub = i < 2 ? DAY_NAMES[d.getDay()] : d.getDate() === 1 ? `1 ${MONTHS[d.getMonth()]}` : String(d.getDate());
    return { offset: i, label, sub };
  });
}

/** "Today", "Tomorrow" or "Sat 31". */
export function dayLabel(d: Date, now = new Date()): string {
  const diff = Math.round((dayStart(0, d).getTime() - dayStart(0, now).getTime()) / 864e5);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
}

/** The tag on a beacon: "Now · till 6pm" while it's live, otherwise "Sat 31 · 9am to 12pm". */
export function whenLabel(start: Date, end: Date, now = new Date()): { text: string; live: boolean } {
  if (start <= now) return { text: `Now · till ${fmtTime(end)}`, live: true };
  return { text: `${dayLabel(start, now)} · ${fmtRange(start, end)}`, live: false };
}

/** Quick windows for a day. Today: only ones that haven't finished, plus "Next 2 hours". */
export function presetWindows(offset = 0, now = new Date()): Window[] {
  const day = dayStart(offset, now);
  const list: Window[] = [];
  if (offset === 0) {
    const two = new Date(now.getTime() + 2 * 3600e3);
    const endOfDay = at(day, 23, 59);
    list.push({ id: 'now', label: 'Next 2 hours', start: now, end: two > endOfDay ? endOfDay : two });
  }
  const add = (id: string, label: string, s: Date, e: Date) => {
    if (e > now) list.push({ id, label, start: s < now ? now : s, end: e });
  };
  if (offset > 0) add('morning', 'Morning', at(day, 9), at(day, 12));
  add('lunch', 'Lunch', at(day, 12), at(day, 14));
  add('afternoon', 'Afternoon', at(day, 14), at(day, 17));
  add('early', 'Early evening', at(day, 17), at(day, 19));
  add('tonight', 'Tonight', at(day, 19), at(day, 23));
  return list;
}

/** Half-hour slots for "Pick times": from now (today) or 7am (other days) until 11:30pm. */
export function halfHourSlots(offset = 0, now = new Date()): Date[] {
  const slots: Date[] = [];
  const d = offset === 0 ? new Date(now) : at(dayStart(offset, now), 6, 30);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  while (d.getHours() !== 0 && slots.length < 40) {
    slots.push(new Date(d));
    d.setMinutes(d.getMinutes() + 30);
  }
  return slots;
}

export function activityPhrase(acts: string[]): string {
  if (acts.includes('Anything')) return 'anything';
  const l = acts.map((a) => a.toLowerCase());
  return l.length < 2 ? l[0] ?? '' : `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}`;
}
export function activityTitle(acts: string[]): string {
  if (acts.includes('Anything')) return 'Up for anything';
  return acts.length < 2 ? acts[0] ?? '' : `${acts.slice(0, -1).join(', ')} or ${acts[acts.length - 1]}`;
}

