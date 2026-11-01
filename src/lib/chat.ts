import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

// Chat on a plan (decision 79, migration 0023). A thread is a beacon or a Find a day, never both.
// Beacon: the owner and everyone who's in. Find a day: everyone asked. Text only, 300 characters.
// Every message buzzes everyone else in the thread unless they've muted it (decision 88).

export type Thread = { beaconId?: string | null; pollId?: string | null };
export const threadId = (t: Thread) => (t.beaconId ?? t.pollId)!;

export type ChatMessage = {
  id: number;
  user_id: string;
  body: string;
  kind: 'text' | 'event';
  meta: { place_id?: string | null; label?: string | null; what?: string; when?: string; day?: string } | null;
  created_at: string;
  profiles: { full_name: string } | null;
};

export type ThreadInfo = { unread: number; lastFrom: string | null; lastBody: string | null; lastMine: boolean; lastKind: string | null; lastMeta: ChatMessage['meta'] };

export const MAX_MESSAGE = 300;

/** New-message counts and last message for every thread you're in, by beacon or poll id. */
export async function fetchChatOverview(): Promise<Record<string, ThreadInfo>> {
  const { data, error } = await supabase.rpc('chat_overview');
  if (error || !data) return {};
  const out: Record<string, ThreadInfo> = {};
  for (const r of data as any[]) {
    out[r.thread_id] = { unread: r.unread ?? 0, lastFrom: r.last_from, lastBody: r.last_body, lastMine: !!r.last_mine, lastKind: r.last_kind, lastMeta: r.last_meta };
  }
  return out;
}

export async function fetchMessages(t: Thread): Promise<ChatMessage[]> {
  let q = supabase.from('messages').select('id, user_id, body, kind, meta, created_at, profiles(full_name)').order('id', { ascending: true }).limit(500);
  q = t.beaconId ? q.eq('beacon_id', t.beaconId) : q.eq('poll_id', t.pollId!);
  const { data } = await q;
  return (data ?? []) as unknown as ChatMessage[];
}

export async function sendMessage(t: Thread, body: string) {
  return supabase.rpc('send_message', { p_beacon_id: t.beaconId ?? null, p_poll_id: t.pollId ?? null, p_body: body });
}

export async function markRead(t: Thread) {
  await supabase.rpc('mark_chat_read', { p_beacon_id: t.beaconId ?? null, p_poll_id: t.pollId ?? null });
}

/** Is this chat muted for you? (decision 88) */
export async function fetchMuted(thread: string): Promise<boolean> {
  const { data } = await supabase.from('chat_reads').select('muted').eq('thread_id', thread).maybeSingle();
  return !!(data as { muted?: boolean } | null)?.muted;
}

export async function setMuted(t: Thread, muted: boolean) {
  return supabase.rpc('set_chat_muted', { p_beacon_id: t.beaconId ?? null, p_poll_id: t.pollId ?? null, p_muted: muted });
}

export async function reportMessage(id: number) {
  return supabase.rpc('report_message', { p_message_id: id });
}

export async function blockUser(userId: string) {
  return supabase.rpc('block_user', { p_user_id: userId });
}

/** The chat overview, refreshed with home. */
export function useChatOverview(deps: unknown[]) {
  const [overview, setOverview] = useState<Record<string, ThreadInfo>>({});
  const refresh = useCallback(() => fetchChatOverview().then(setOverview), []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { overview, refresh };
}

/** Listen for new messages in one thread. Calls back on each insert; falls back to the screen's own polling. */
export function subscribeToThread(t: Thread, onNew: () => void) {
  const filter = t.beaconId ? `beacon_id=eq.${t.beaconId}` : `poll_id=eq.${t.pollId}`;
  const ch = supabase
    .channel(`chat:${threadId(t)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, onNew)
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
