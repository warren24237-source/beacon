import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchPolls, tally, type Poll } from './polls';
import { border, Button, colors, Label, shadow, Text } from './ui';

// The "Find a date" tab on home: ones you organised, ones you've been asked to.
export function PollsHome({ userId }: { userId: string }) {
  const [polls, setPolls] = useState<Poll[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchPolls().then(setPolls);
    }, [])
  );

  const mine = (polls ?? []).filter((p) => p.owner_id === userId);
  const asked = (polls ?? []).filter((p) => p.owner_id !== userId);

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.h1}>Find a date</Text>
        <Text style={styles.muted}>Ask a group when they&apos;re free, weeks ahead.</Text>
      </View>

      {asked.length > 0 && (
        <View style={styles.group}>
          <Label>You&apos;ve been asked</Label>
          {asked.map((p) => {
            const me = p.poll_invitees.find((i) => i.user_id === userId);
            return (
              <Item
                key={p.id}
                title={p.title}
                sub={`From ${p.owner?.full_name ?? 'a friend'} · ${me?.answered_at ? 'you answered' : 'tap to answer'}`}
                flag={!me?.answered_at}
                onPress={() => router.push(`/poll/${p.id}`)}
              />
            );
          })}
        </View>
      )}

      {mine.length > 0 && (
        <View style={styles.group}>
          <Label>Yours</Label>
          {mine.map((p) => {
            const t = tally(p);
            return (
              <Item
                key={p.id}
                title={p.title}
                sub={`${t.answered} of ${t.total} answered`}
                onPress={() => router.push(`/poll/${p.id}`)}
              />
            );
          })}
        </View>
      )}

      {polls && polls.length === 0 && <Text style={styles.muted}>Nothing yet. Start one and pick a few dates.</Text>}

      <Button label="Find a date" onPress={() => router.push('/find-date')} />
    </View>
  );
}

function Item({ title, sub, flag, onPress }: { title: string; sub: string; flag?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.muted, flag && { color: colors.ink, fontWeight: '800' }]}>{sub}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  item: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17, fontWeight: '800' },
  chev: { fontSize: 22, fontWeight: '800' },
});
