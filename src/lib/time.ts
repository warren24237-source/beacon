// Dates, times and wording for beacons. No imports, so the automatic tests can check it directly.

export type Window = { id: string; label: string; start: Date; end: Date };

export function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}
/** "9pm to 11pm"; a plan that runs to the end of the day says "to midnight", not "to 12am". */
export const fmtRange = (a: Date, b: Date) => `${fmtTime(a)} to ${b.getHours() === 0 && b.getMinutes() === 0 ? 'midnight' : fmtTime(b)}`;

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

/** The next :00 or :30 at or after `d` (13:54 -> 14:00, 13:10 -> 13:30, 14:00 -> 14:00). */
export function nextHalfHour(d: Date): Date {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const m = x.getMinutes();
  if (m === 0 || m === 30) return x;
  x.setMinutes(m < 30 ? 30 : 60);
  return x;
}

/** The six standard blocks of a day (Warren, 31 Oct). Shared by beacons and Find a day. */
export const DAY_BLOCKS = [
  { id: 'early-morning', label: 'Early morning', start: 6 * 60, end: 9 * 60 },
  { id: 'mid-morning', label: 'Mid morning', start: 9 * 60, end: 12 * 60 },
  { id: 'early-afternoon', label: 'Early afternoon', start: 12 * 60, end: 15 * 60 },
  { id: 'late-afternoon', label: 'Late afternoon', start: 15 * 60, end: 18 * 60 },
  { id: 'early-evening', label: 'Early evening', start: 18 * 60, end: 21 * 60 },
  { id: 'late-evening', label: 'Late evening', start: 21 * 60, end: 24 * 60 },
] as const;

/**
 * Quick windows for a day: the six standard blocks. Today: "Next 2 hours" first, blocks that have
 * passed drop off, and a block under way starts at the next half hour (never 1:54pm), as long as
 * at least an hour of it is left.
 */
export function presetWindows(offset = 0, now = new Date()): Window[] {
  const day = dayStart(offset, now);
  const list: Window[] = [];
  const from = nextHalfHour(now);
  if (offset === 0) {
    const endOfDay = at(day, 24);
    const two = nextHalfHour(new Date(now.getTime() + 2 * 3600e3));
    list.push({ id: 'now', label: 'Next 2 hours', start: now, end: two > endOfDay ? endOfDay : two });
  }
  for (const b of DAY_BLOCKS) {
    let s = at(day, Math.floor(b.start / 60), b.start % 60);
    const e = at(day, Math.floor(b.end / 60), b.end % 60);
    if (offset === 0 && s < from) s = from;
    if (e.getTime() - s.getTime() >= 3600e3) list.push({ id: b.id, label: b.label, start: s, end: e });
  }
  return list;
}

/** Half-hour slots for "Pick times": from the next half hour (today) or 6am (other days) until 11:30pm. */
export function halfHourSlots(offset = 0, now = new Date()): Date[] {
  const slots: Date[] = [];
  const d = offset === 0 ? nextHalfHour(now) : at(dayStart(offset, now), 6);
  while (d.getHours() !== 0 && slots.length < 40) {
    slots.push(new Date(d));
    d.setMinutes(d.getMinutes() + 30);
  }
  return slots;
}

/** Recent activities first (up to 3, newest first, no repeats, never "Anything"), then the standard list. */
export function activityOptions(recentBeacons: string[][], standard: readonly string[]): { label: string; recent: boolean }[] {
  const recents: string[] = [];
  for (const acts of recentBeacons) {
    for (const a of acts) {
      const t = a.trim();
      if (t && t !== 'Anything' && !recents.some((r) => r.toLowerCase() === t.toLowerCase())) recents.push(t);
      if (recents.length === 3) break;
    }
    if (recents.length === 3) break;
  }
  const rest = standard.filter((s) => !recents.some((r) => r.toLowerCase() === s.toLowerCase()));
  return [...recents.map((label) => ({ label, recent: true })), ...rest.map((label) => ({ label, recent: false }))];
}

/** Tidies typed text into an activity: trimmed, single spaces, capital first letter, 20 characters max. */
export function cleanActivity(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** The notification friends get, as close to the server's wording (light_beacon) as the phone can make it. */
export function beaconPreview(name: string, acts: string[], start: Date, end: Date, now = new Date()): string {
  const diff = Math.round((dayStart(0, start).getTime() - dayStart(0, now).getTime()) / 864e5);
  // Starting now: "now till 9:30pm", never the current minute (matches the server's when_phrase, migration 0025).
  if (start.getTime() <= now.getTime() + 60e3) return `${name}'s up for ${activityPhrase(acts)}, now till ${fmtRange(end, end).split(' to ')[1]}`;
  const day = diff <= 0 ? '' : diff === 1 ? 'tomorrow, ' : `${DAY_NAMES[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}, `;
  return `${name}'s up for ${activityPhrase(acts)}, ${day}${fmtRange(start, end)}`;
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

