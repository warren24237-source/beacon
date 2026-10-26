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

function at(hours: number, minutes = 0): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Quick windows for today that haven't finished yet. */
export function presetWindows(now = new Date()): Window[] {
  const two = new Date(now.getTime() + 2 * 3600e3);
  const endOfDay = at(23, 59);
  const list: Window[] = [{ id: 'now', label: 'Next 2 hours', start: now, end: two > endOfDay ? endOfDay : two }];
  const add = (id: string, label: string, s: Date, e: Date) => {
    if (e > now) list.push({ id, label, start: s < now ? now : s, end: e });
  };
  add('lunch', 'Lunch', at(12), at(14));
  add('afternoon', 'Afternoon', at(14), at(17));
  add('early', 'Early evening', at(17), at(19));
  add('tonight', 'Tonight', at(19), at(23));
  return list;
}

/** Half-hour slots from now until 11:30pm, for "Pick times". */
export function halfHourSlots(now = new Date()): Date[] {
  const slots: Date[] = [];
  const d = new Date(now);
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

// WhatsApp ------------------------------------------------------------------------

/** Opens WhatsApp with the message ready. With a number it goes straight to that chat;
 *  without one, WhatsApp asks which chat or group to send it to. */
export function openWhatsApp(text: string, number?: string | null) {
  return Linking.openURL(`https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`);
}

/** Opens the phone's messages app on a thread with this person, message ready. */
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

export async function fetchMyBeacon(userId: string) {
  const { data } = await supabase
    .from('beacons')
    .select('*, responses(user_id, created_at, profiles(full_name, phone_number))')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as (Beacon & { responses: { user_id: string; profiles: { full_name: string; phone_number: string | null } | null }[] }) | null;
}

export async function fetchFriendsBeacons(userId: string) {
  const { data } = await supabase
    .from('beacons')
    .select('*, owner:profiles!beacons_owner_id_fkey(full_name, phone_number), responses(user_id)')
    .neq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('created_at', { ascending: false });
  return (data ?? []) as (Beacon & { responses: { user_id: string }[] })[];
}
