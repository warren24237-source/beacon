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
