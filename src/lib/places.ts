import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

import { supabase } from './supabase';

// Places (decision 58). All Google calls go through our "places" server function, which keeps
// the key secret and caps daily use. We store only Google's place ID; names come fresh from Google.

export type FoundPlace = { id: string; name: string; area: string };
export type PlaceInfo = FoundPlace & { mapsUrl: string };

/** One place on a beacon: a real Google place (placeId) or text as typed (label). */
export type BeaconPlace = { position: number; place_id: string | null; label: string | null; starred: boolean };
/** A place being added in the light sheet, before the beacon exists. */
export type DraftPlace = { placeId?: string; label?: string; name: string; area?: string; starred: boolean };

/** A fresh session token per search, so Google bills the typing and the pick as one session. */
export const newSession = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function searchPlaces(input: string, session: string): Promise<{ places: FoundPlace[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('places', { body: { action: 'search', input, session } });
  if (error) return { places: [], error: 'Place search is unavailable right now. You can still use what you typed.' };
  return { places: (data?.places ?? []) as FoundPlace[] };
}

// Names and addresses, kept in memory for this app session only (Google's terms: don't store them).
const known = new Map<string, PlaceInfo>();
const pending = new Map<string, Promise<void>>();

// A tiny store, so screens redraw when names arrive (the compiler can't see a plain Map change).
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** Re-renders the calling component whenever new place names arrive; pass the result to placeInfo. */
export const usePlacesVersion = () => useSyncExternalStore(subscribe, () => version);

/** A place's name and address if loaded. `v` (from usePlacesVersion) ties the read to redraws. */
export function placeInfo(id: string, v: number): PlaceInfo | undefined {
  return v >= 0 ? known.get(id) : undefined;
}
export function cachedPlace(id: string): PlaceInfo | undefined {
  return known.get(id);
}

/** Looks up any place IDs we haven't seen this session, in one call. */
export async function loadPlaces(ids: string[], session?: string): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !known.has(id) && !pending.has(id));
  if (!missing.length) {
    await Promise.all(ids.map((id) => pending.get(id)).filter(Boolean));
    return;
  }
  const job = (async () => {
    const { data } = await supabase.functions.invoke('places', { body: { action: 'details', ids: missing, session } });
    const got = (data?.places ?? {}) as Record<string, PlaceInfo>;
    Object.values(got).forEach((p) => known.set(p.id, p));
    version += 1;
    listeners.forEach((fn) => fn());
  })();
  missing.forEach((id) => pending.set(id, job));
  try {
    await job;
  } finally {
    missing.forEach((id) => pending.delete(id));
  }
}

/** Opens Google Maps on the place (the Maps app if installed, otherwise the browser). */
export function openInMaps(p: PlaceInfo) {
  const url = p.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${encodeURIComponent(p.id)}`;
  return Linking.openURL(url);
}

/** "The Malt Cross", "The Malt Cross or Dan's", "A, B or C". */
export function placesPhrase(names: string[]): string {
  const n = names.filter(Boolean);
  return n.length < 2 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}`;
}
