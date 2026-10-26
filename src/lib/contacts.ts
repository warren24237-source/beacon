import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { normaliseWhatsAppNumber } from './phone';
import { supabase } from './supabase';

export type ContactMatch = { id: string; full_name: string; phone_number: string; status: 'friends' | 'requested' | 'incoming' | 'none' };

/** One person from the phone's contacts, and their Beacon account if they have one. */
export type PhoneContact = { key: string; name: string; number: string; match: ContactMatch | null };

type Result = { ok: true; people: PhoneContact[] } | { ok: false; reason: string };

/**
 * Reads the phone's contacts (names and numbers), and asks Beacon which numbers belong
 * to people on Beacon. Contacts stay on the phone; numbers are compared on the server, never stored.
 */
export async function loadPhoneContacts(): Promise<Result> {
  const { status } = await requestPermissionsAsync();
  if (status !== 'granted') return { ok: false, reason: 'Beacon needs access to your contacts to find friends. You can allow it in your phone settings.' };

  const details = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const, { limit: 5000 });
  const people: { name: string; numbers: string[] }[] = [];
  const all = new Set<string>();
  for (const c of details as any[]) {
    const name = String(c.fullName ?? '').trim();
    const numbers = [...new Set(((c.phones ?? []) as any[]).map((p) => (p?.number ? normaliseWhatsAppNumber(p.number) : null)).filter(Boolean) as string[])];
    if (!name || !numbers.length) continue;
    numbers.forEach((n) => all.add(n));
    people.push({ name, numbers });
  }
  if (!people.length) return { ok: true, people: [] };

  const { data, error } = await supabase.rpc('find_contacts_on_beacon', { p_numbers: [...all].slice(0, 3000) });
  if (error) return { ok: false, reason: error.message };
  const byNumber = new Map(((data ?? []) as ContactMatch[]).map((m) => [m.phone_number, m]));

  const out = people.map((p, i) => {
    const hit = p.numbers.find((n) => byNumber.has(n));
    return { key: `${i}`, name: p.name, number: hit ?? p.numbers[0], match: hit ? byNumber.get(hit)! : null };
  });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, people: out };
}
