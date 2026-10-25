import { supabase } from './supabase';

// Find a date: dates are plain 'YYYY-MM-DD' strings in local time.

export type Poll = {
  id: string;
  owner_id: string;
  title: string;
  dates: string[];
  time_label: string;
  created_at: string;
  owner: { full_name: string } | null;
  poll_invitees: { user_id: string; answered_at: string | null; profiles: { full_name: string } | null }[];
  poll_answers: { user_id: string; day: string }[];
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function fmtDay(s: string): string {
  const d = parseYmd(s);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
export function todayYmd(): string {
  return ymd(new Date());
}

/** Every date between from and to (inclusive) that falls on one of the weekdays (0 = Sunday). */
export function weeklyDates(days: number[], from: string, to: string): string[] {
  const out: string[] = [];
  const end = parseYmd(to);
  for (let d = parseYmd(from); d <= end && out.length < 60; d.setDate(d.getDate() + 1)) {
    if (days.includes(d.getDay())) out.push(ymd(d));
  }
  return out;
}

export const TIME_OPTIONS = [
  { id: 'any', label: 'Any time', range: '' },
  { id: 'day', label: 'Daytime', range: '10am to 5pm' },
  { id: 'eve', label: 'Evening', range: '6pm to 9pm' },
  { id: 'custom', label: 'Pick times', range: '' },
] as const;

/** Half-hour times across the day, as minutes after midnight. */
export const DAY_SLOTS = Array.from({ length: 36 }, (_, i) => 6 * 60 + i * 30); // 6am to 11:30pm
export function fmtMinutes(m: number): string {
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return mm ? `${h}:${String(mm).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

const SELECT =
  '*, owner:profiles!polls_owner_id_fkey(full_name), poll_invitees(user_id, answered_at, profiles(full_name)), poll_answers(user_id, day)';

export async function fetchPolls(): Promise<Poll[]> {
  const { data } = await supabase.from('polls').select(SELECT).order('created_at', { ascending: false }).limit(30);
  return (data ?? []) as Poll[];
}

export async function fetchPoll(id: string): Promise<Poll | null> {
  const { data } = await supabase.from('polls').select(SELECT).eq('id', id).maybeSingle();
  return (data as Poll) ?? null;
}

/** Who's free on each date, best first (most people, then earliest). */
export function tally(p: Poll) {
  const names = new Map(p.poll_invitees.map((i) => [i.user_id, i.profiles?.full_name ?? 'A friend']));
  const rows = p.dates.map((day) => ({
    day,
    who: p.poll_answers.filter((a) => a.day === day).map((a) => names.get(a.user_id) ?? 'A friend'),
  }));
  const best = [...rows].sort((a, b) => b.who.length - a.who.length || a.day.localeCompare(b.day))[0];
  return { rows, best, total: p.poll_invitees.length, answered: p.poll_invitees.filter((i) => i.answered_at).length };
}
