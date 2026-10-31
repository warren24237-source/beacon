import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { supabase } from './supabase';
import { border, colors, ErrorText, shadow, Text } from './ui';

// Nudge (decision 87): the organiser nudges someone who hasn't answered, once per person per plan.
// People who hid it are skipped silently on the server; here it always says "Nudged", so hiding stays private.

type Person = { id: string; name: string };

/** Everyone a beacon went to who hasn't said I'm in yet. */
export async function fetchNotAnswered(beaconId: string, inIds: string[]): Promise<Person[]> {
  const { data } = await supabase.from('beacon_recipients').select('user_id, profiles(full_name)').eq('beacon_id', beaconId);
  return ((data ?? []) as any[])
    .filter((r) => !inIds.includes(r.user_id))
    .map((r) => ({ id: r.user_id as string, name: (r.profiles?.full_name as string) ?? 'A friend' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Tell the server a beacon was hidden or unhidden on this phone, so nudges skip it. */
export function syncHidden(beaconId: string, hidden: boolean) {
  supabase.rpc('set_hidden', { p_beacon_id: beaconId, p_hidden: hidden }).then(() => {});
}

export function NudgeList({ beaconId, pollId, people }: { beaconId?: string; pollId?: string; people: Person[] }) {
  const plan = beaconId ?? pollId!;
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    supabase
      .from('nudges')
      .select('user_id')
      .eq('plan_id', plan)
      .then(({ data }) => {
        if (live) setDone(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
      });
    return () => {
      live = false;
    };
  }, [plan]);

  if (!people.length) return null;

  async function nudge(p: Person) {
    setBusy(p.id);
    setError('');
    const { error } = await supabase.rpc('nudge', { p_beacon_id: beaconId ?? null, p_poll_id: pollId ?? null, p_user_id: p.id });
    setBusy(null);
    if (error && !/Already nudged/.test(error.message)) return setError(error.message);
    setDone((d) => [...d, p.id]);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Not answered yet</Text>
      {people.map((p) => {
        const nudged = done.includes(p.id);
        return (
          <View key={p.id} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
            {nudged ? (
              <Text style={styles.nudged}>Nudged</Text>
            ) : (
              <Pressable
                onPress={() => nudge(p)}
                disabled={busy === p.id}
                accessibilityRole="button"
                accessibilityLabel={`Nudge ${p.name}`}
                style={({ pressed }) => [styles.button, pressed && { boxShadow: 'none', transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
                <Text style={styles.buttonText}>{busy === p.id ? '…' : 'Nudge'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Text style={styles.small}>One nudge each. They get a buzz from you, nobody else is told.</Text>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  button: { backgroundColor: colors.card, ...border, ...shadow.select, paddingVertical: 5, paddingHorizontal: 12 },
  buttonText: { fontSize: 14, fontWeight: '800' },
  nudged: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12 },
});
