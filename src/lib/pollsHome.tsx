import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { tally, todayYmd, type Poll } from './polls';
import { border, colors, shadow, Text } from './ui';

// Find a date asks on home (decision 69). They sit in the same lists as beacons, with a small tag.
// Yours and ones you've answered go under "Your plans"; ones you haven't answered under "Waiting on you".

export function splitPolls(all: Poll[], userId: string) {
  // Once every date has passed, an ask leaves home.
  const today = todayYmd();
  const polls = all.filter((p) => p.dates.some((d) => d >= today));
  const answered = (p: Poll) => !!p.poll_invitees.find((i) => i.user_id === userId)?.answered_at;
  return {
    plans: polls.filter((p) => p.owner_id === userId || answered(p)),
    waiting: polls.filter((p) => p.owner_id !== userId && !answered(p)),
  };
}

export function PollRow({ poll, userId }: { poll: Poll; userId: string }) {
  const own = poll.owner_id === userId;
  const t = tally(poll);
  const from = poll.owner?.full_name ?? 'A friend';
  const waiting = !own && !poll.poll_invitees.find((i) => i.user_id === userId)?.answered_at;
  const sub = own ? `${t.answered} of ${t.total} answered` : waiting ? `From ${from} · tap to answer` : `From ${from} · you answered`;
  return (
    <Pressable
      onPress={() => router.push(`/poll/${poll.id}`)}
      style={({ pressed }) => [styles.item, waiting && styles.waiting, pressed && { transform: [{ translateX: 3 }, { translateY: 3 }], boxShadow: 'none' }]}
      accessibilityRole="button"
      accessibilityLabel={`Find a date: ${poll.title}. ${sub}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.kind}>FIND A DATE</Text>
        <Text style={styles.title} numberOfLines={1}>
          {poll.title}
        </Text>
        <Text style={[styles.sub, waiting && { color: colors.ink, fontWeight: '800' }]}>{sub}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.card, ...border, ...shadow.card, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  waiting: { backgroundColor: colors.card },
  kind: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: colors.muted },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 14 },
  chev: { fontSize: 22, fontWeight: '800' },
});
