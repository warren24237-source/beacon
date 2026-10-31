// No imports, so it can be tested on its own.

/**
 * Where tapping a buzz takes you (31 Oct), once per notification:
 * - chat: that plan's chat
 * - poll (asked, answered, locked in a date): that Find a day
 * - beacon (new, changed), response (someone's in), out (can't make it), locked, suggestion, reminder:
 *   home, with that beacon opened (yours, or one you're in on; a new one sits in Waiting on you)
 * - called_off: Past plans, where it now lives
 * - friend_request, friend_accept: Friends
 */
export type BuzzData = { type?: string; poll_id?: string | null; beacon_id?: string | null };
export type BuzzRoute = { chat?: { beaconId?: string | null; pollId?: string | null }; href?: string; beacon?: string };

export function routeForBuzz(data: BuzzData | undefined): BuzzRoute | null {
  if (!data?.type) return null;
  if (data.type === 'chat' && (data.beacon_id || data.poll_id)) return { chat: { beaconId: data.beacon_id, pollId: data.poll_id } };
  if (data.type === 'poll' && data.poll_id) return { href: `/poll/${data.poll_id}` };
  if (data.type === 'called_off') return { href: '/past' };
  if (data.type === 'friend_request' || data.type === 'friend_accept') return { href: '/friends' };
  if (data.beacon_id) return { beacon: data.beacon_id };
  return null;
}

