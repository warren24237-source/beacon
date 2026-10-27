import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

import type { BeaconPlace } from './places';
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
  /** Set once the owner taps "Lock it in" (decision 61). */
  locked_at?: string | null;
  /** The place it was locked in at, a position in beacon_places (decision 77). */
  confirmed_position?: number | null;
  owner?: { full_name: string; phone_number: string | null } | null;
  beacon_places?: BeaconPlace[];
  /** Preferences: on your beacons, everyone's; on friends' beacons, only yours (row rules). */
  place_prefs?: { user_id: string; position: number | null }[];
};

export type Circle = { id: string; name: string; member_ids: string[] };
export type Friend = { id: string; full_name: string };


// Time helpers live in ./time (tested on their own).
export * from './time';

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

/** Opens a message thread with this person in whichever app the phone uses (Messages, WhatsApp, Telegram...).
 *  No ready-written text: WhatsApp reads "number?body=..." as the whole number and says the person
 *  isn't on WhatsApp (Warren, 26 Oct). Anything with content to send (invites) uses the Share menu. */
export function openSms(number: string) {
  return Linking.openURL(`sms:+${number}`);
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
    .select('*, responses(user_id, created_at, profiles(full_name, phone_number)), beacon_places(position, place_id, label, starred, suggested_by), place_prefs(user_id, position)')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  return (data ?? []) as MyBeacon[];
}

export type LockedPerson = { id: string; full_name: string; phone_number: string | null };

/** Who's in on a locked beacon you're in on, owner first. Numbers only for your friends (decision 28). */
export async function fetchLockedInWith(beaconId: string): Promise<LockedPerson[]> {
  const { data } = await supabase.rpc('locked_in_with', { p_beacon_id: beaconId });
  return (data ?? []) as LockedPerson[];
}

/** `to`: everyone else it went to, by first name (decision 75; missing before migration 0019). */
export type BeaconSummary = { sent: number; to?: string[]; in: string[] };

/** How many a beacon went to and who's in, by first name (decision 63). Never who it went to or numbers. */
export async function fetchSummary(beaconId: string): Promise<BeaconSummary | null> {
  const { data } = await supabase.rpc('beacon_summary', { p_beacon_id: beaconId });
  return (data as BeaconSummary | null) ?? null;
}

/** "Charlotte", "Charlotte and Kat", "Charlotte, Kat and Sam". */
export function namesList(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function fetchFriendsBeacons(userId: string) {
  const { data } = await supabase
    .from('beacons')
    .select('*, owner:profiles!beacons_owner_id_fkey(full_name, phone_number), responses(user_id), beacon_places(position, place_id, label, starred, suggested_by), place_prefs(user_id, position)')
    .neq('owner_id', userId)
    .eq('is_active', true)
    .gt('end_time', new Date().toISOString())
    .order('start_time', { ascending: true });
  return (data ?? []) as (Beacon & { responses: { user_id: string }[] })[];
}
