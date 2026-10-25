import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { normaliseWhatsAppNumber } from './phone';
import { supabase } from './supabase';

export type ContactMatch = { id: string; full_name: string; phone_number: string; status: 'friends' | 'requested' | 'incoming' | 'none' };

/**
 * Reads phone numbers from the phone's contacts, normalises them and asks Beacon
 * which ones belong to people on Beacon. Numbers are compared on the server, never stored.
 */
export async function findContactsOnBeacon(): Promise<{ ok: true; matches: ContactMatch[] } | { ok: false; reason: string }> {
  const { status } = await requestPermissionsAsync();
  if (status !== 'granted') return { ok: false, reason: 'Beacon needs access to your contacts to find friends. You can allow it in your phone settings.' };

  const details = await Contact.getAllDetails([ContactField.PHONES] as const, { limit: 5000 });
  const numbers = new Set<string>();
  for (const c of details) {
    for (const p of (c as any).phones ?? []) {
      const n = p?.number ? normaliseWhatsAppNumber(p.number) : null;
      if (n) numbers.add(n);
    }
  }
  if (!numbers.size) return { ok: true, matches: [] };

  const { data, error } = await supabase.rpc('find_contacts_on_beacon', { p_numbers: [...numbers].slice(0, 3000) });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, matches: (data ?? []) as ContactMatch[] };
}
