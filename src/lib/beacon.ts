import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

import { supabase } from './supabase';

export const ACTIVITIES = ['Coffee', 'Drinks', 'Food', 'Play date', 'Anything'] as const;

export type Beacon = {
  id: string;
  owner_id: string;
  activities: string[];
  note: string | null;
  start_time: string;
  end_time: string;
  is_active: boolean;
  owner?: { full_name: string; phone_number: string | null } | null;
};

export type Circle = { id: string; name: string; member_ids: string[] };
export type Friend = { id: string; full_name: string };

export type Window = { id: string; label: string; start: Date; end: Date };

// Time helpers -----------------------------------------------------------

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

// Remembered audience -----------------------------------------------------------

const AUDIENCE_KEY = 'beacon:lastAudience';
export async function loadAudience(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(AUDIENCE_KEY);
    return v ? JSON.parse(v) : ['everyone'];
  } catch {
    return ['everyone'];
  }
}
export async function saveAudience(a: string[]) {
  try {
    await AsyncStorage.setItem(AUDIENCE_KEY, JSON.stringify(a));
  } catch {}
}

// Hidden friends' beacons (per phone, silent) -------------------------------------

const HIDDEN_KEY = 'beacon:hidden';
export async function loadHidden(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(HIDDEN_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}
export async function saveHidden(ids: string[]) {
  try {
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {}
}

// Reaching people (decision 52): Message and Call, in whatever app each phone uses --------

/** Opens a message to this person, text ready. Android lets each phone pick its app (Messages, WhatsApp, Telegram...)
 *  and remember it with "Always", so Beacon never assumes one. */
export function openSms(number: string, text?: string) {
  const body = text ? `?body=${encodeURIComponent(text)}` : '';
  return Linking.openURL(`sms:+${number}${body}`);
}

/** Opens the phone's dialler with this person's number. */
export function callNumber(number: string) {
  return Linking.openURL(`tel:+${number}`);
}

// Data --------------------------------------------------------------------------

export async function fetchFriends(): Promise<Friend[]> {
  const { data } = await supabase.from('friendships').select('friend_id, profiles!friendships_friend_id_fkey(id, full_name)');
  return (data ?? [])
    .map((r: any) => r.profiles)
    .filter(Boolean)
    .sort((a: Friend, b: Friend) => a.full_name.localeCompare(b.full_name));
}

export async function fetchCircles(): Promise<Circle[]> {
  const { data } = await supabase.from('circles').select('id, name, circle_members(member_id)').order('created_at');
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, member_ids: c.circle_members.map((m: any) => m.member_id) }));
}

export type MyBeacon = Beacon & { responses: { user_id: string; profiles: { full_name: string; phone_number: string | null } | null }[] };

/** All your beacons that haven't gone out, soonest first (decision 51). */
export async function fetchMyBeacons(userId: string): Promise<MyBeacon[]> {
  const { data } = await supabase
    .from('beacons')
    .select('*, responses(user_id, created_at, profiles(full_name, phone_number))')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  return (data ?? []) as MyBeacon[];
}

export async function fetchFriendsBeacons(userId: string) {
  const { data } = await supabase
    .from('beacons')
    .select('*, owner:profiles!beacons_owner_id_fkey(full_name, phone_number), responses(user_id)')
    .neq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  return (data ?? []) as (Beacon & { responses: { user_id: string }[] })[];
}
