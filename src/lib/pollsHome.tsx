import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ThreadInfo } from './chat';
import { ChatButton } from './chatui';
import { fmtDay, pollLive, tally, type Poll } from './polls';
import { border, colors, shadow, Text } from './ui';

// Find a day asks on home (decision 69). Ones you haven't answered under "Needs your answer", yours under
// "You're organising", ones you've answered under "You're going" (31 Oct).

export function splitPolls(all: Poll[], userId: string) {
  // Once its locked day (or every date) has passed, an ask moves to Past plans.
  const polls = all.filter((p) => pollLive(p));
  const answered = (p: Poll) => !!p.poll_invitees.find((i) => i.user_id === userId)?.answered_at;
  return {
    plans: polls.filter((p) => p.owner_id === userId),
    joined: polls.filter((p) => p.owner_id !== userId && answered(p)),
    waiting: polls.filter((p) => p.owner_id !== userId && !answered(p)),
  };
}

export function PollRow({ poll, userId, chat }: { poll: Poll; userId: string; chat?: ThreadInfo }) {
  const own = poll.owner_id === userId;
  const t = tally(poll);
  const from = poll.owner?.full_name ?? 'A friend';
  const waiting = !own && !poll.poll_invitees.find((i) => i.user_id === userId)?.answered_at;
  const locked = poll.locked_day ? `${fmtDay(poll.locked_day)} · ${poll.time_label}` : null;
  const sub = locked
    ? own ? `Locked in: ${locked}` : `From ${from} · ${locked}`
    : own ? `${t.answered} of ${t.total} answered` : waiting ? `From ${from} · tap to answer` : `From ${from} · you answered`;
  return (
    <Pressable
      onPress={() => router.push(`/poll/${poll.id}`)}
      style={({ pressed }) => [styles.item, waiting && styles.waiting, pressed && { transform: [{ translateX: 3 }, { translateY: 3 }], boxShadow: 'none' }]}
      accessibilityRole="button"
      accessibilityLabel={`Find a day: ${poll.title}. ${sub}`}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.kind}>{poll.locked_day ? 'FIND A DAY · LOCKED IN' : 'FIND A DAY'}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {poll.title}
        </Text>
        <Text style={[styles.sub, waiting && { color: colors.ink, fontWeight: '800' }]}>{sub}</Text>
      </View>
      {/* Chat on the bar for anyone in it: you, or someone who's answered. Not before you've answered. */}
      {!waiting && <ChatButton thread={{ pollId: poll.id }} title={poll.title} info={chat} />}
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
