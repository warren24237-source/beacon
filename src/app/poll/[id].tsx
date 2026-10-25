import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { openWhatsApp } from '@/lib/beacon';
import { fetchPoll, fmtDay, tally, type Poll } from '@/lib/polls';
import { supabase } from '@/lib/supabase';
import { Button, Card, colors, ErrorText, ScrollScreen } from '@/lib/ui';

// One "Find a date": results for the organiser, ticking dates for everyone else.
export default function PollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const p = await fetchPoll(id);
    setPoll(p);
    if (p) setMine(p.poll_answers.filter((a) => a.user_id === userId).map((a) => a.day));
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (poll === undefined) return <ScrollScreen>{null}</ScrollScreen>;
  if (poll === null)
    return (
      <ScrollScreen>
        <Text style={styles.h1}>Not found</Text>
        <Text style={styles.muted}>This one may have been deleted.</Text>
        <Button label="Back" secondary onPress={close} />
      </ScrollScreen>
    );

  const isOwner = poll.owner_id === userId;
  const me = poll.poll_invitees.find((i) => i.user_id === userId);
  const answered = !!me?.answered_at;
  const { rows, best, total, answered: answeredCount } = tally(poll);
  const waiting = poll.poll_invitees.filter((i) => !i.answered_at).map((i) => i.profiles?.full_name ?? 'A friend');
  const ownerName = poll.owner?.full_name ?? 'A friend';
  const datesLine = `${poll.dates.length} ${poll.dates.length === 1 ? 'date' : 'dates'}, ${poll.time_label.toLowerCase()}`;

  async function send(days: string[]) {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('answer_poll', { p_poll_id: poll!.id, p_days: days });
    setBusy(false);
    if (error) return setError(error.message);
    setEditing(false);
    load();
  }

  // Ticking dates (invitee, first time or changing).
  if (!isOwner && (!answered || editing)) {
    return (
      <ScrollScreen>
        <View style={styles.top}>
          <Text style={styles.h1}>{poll.title}</Text>
          <Pressable onPress={editing ? () => setEditing(false) : close} hitSlop={12}>
            <Text style={styles.link}>{editing ? 'Cancel' : 'Close'}</Text>
          </Pressable>
        </View>
        <Card>
          <Text style={styles.cardTitle}>From {ownerName}</Text>
          <Text style={styles.body}>{datesLine}</Text>
          <Text style={styles.muted}>Tap every date you can do.</Text>
        </Card>
        <View>
          {poll.dates.map((day, i) => {
            const on = mine.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() => setMine((p) => (on ? p.filter((x) => x !== day) : [...p, day]))}
                style={[styles.row, i > 0 && styles.rowLine]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}>
                <View style={styles.grow}>
                  <Text style={styles.day}>{fmtDay(day)}</Text>
                  <Text style={styles.muted}>{poll.time_label}</Text>
                </View>
                <View style={[styles.tick, on && styles.tickOn]}>
                  <Text style={[styles.tickText, on && { color: colors.bg }]}>{on ? '✓' : ''}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <ErrorText>{error}</ErrorText>
        <Button
          label={mine.length ? `Send · ${mine.length} ${mine.length === 1 ? 'date' : 'dates'}` : 'Send'}
          onPress={() => (mine.length ? send(mine) : setError('Tick the dates you can do, or tap "None of these work".'))}
          busy={busy}
        />
        <Button label="None of these work" secondary onPress={() => send([])} />
      </ScrollScreen>
    );
  }

  // Results: organiser, or invitee after answering.
  const shareText = `${poll.title}: ${fmtDay(best.day)}, ${poll.time_label.toLowerCase()} works for ${best.who.length} of ${total}${best.who.length ? ` (${best.who.join(', ')})` : ''}. Shall we lock it in?`;

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Text style={styles.h1}>{isOwner ? poll.title : `Thanks, ${ownerName}'s been told.`}</Text>
        {isOwner ? (
          <Pressable onPress={close} hitSlop={12}>
            <Text style={styles.link}>Done</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setEditing(true)} hitSlop={12}>
            <Text style={styles.link}>Change</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.muted}>
        {isOwner
          ? `${datesLine}. ${answeredCount} of ${total} answered.`
          : mine.length
            ? `You're free on ${mine.length} ${mine.length === 1 ? 'date' : 'dates'}. Here's the group so far.`
            : "You said none of these work. Here's the group so far."}
      </Text>

      {isOwner && best.who.length > 0 && (
        <>
          <View style={styles.best}>
            <Text style={styles.eyebrow}>BEST SO FAR</Text>
            <Text style={styles.cardTitle}>
              {fmtDay(best.day)} · {poll.time_label}
            </Text>
            <Text style={styles.small}>
              {best.who.length} of {total} free: {best.who.join(', ')}
            </Text>
          </View>
          <Button label="Share in WhatsApp" whatsapp onPress={() => openWhatsApp(shareText)} />
        </>
      )}
      {isOwner && best.who.length === 0 && <Text style={styles.body}>No answers yet. You&apos;ll get a notification as people answer.</Text>}

      <View>
        {rows.map((r, i) => (
          <View key={r.day} style={[styles.row, i > 0 && styles.rowLine]}>
            <View style={styles.grow}>
              <Text style={styles.day}>{fmtDay(r.day)}</Text>
              {r.who.length > 0 && <Text style={styles.muted}>{r.who.join(', ')}</Text>}
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${total ? (r.who.length / total) * 100 : 0}%` }]} />
              </View>
            </View>
            <Text style={styles.count}>
              {r.who.length}/{total}
            </Text>
          </View>
        ))}
      </View>
      {isOwner && waiting.length > 0 && <Text style={styles.muted}>Not answered yet: {waiting.join(', ')}.</Text>}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', flex: 1 },
  link: { color: colors.muted, fontSize: 15, paddingTop: 6 },
  muted: { color: colors.muted, fontSize: 14 },
  body: { color: colors.text, fontSize: 16 },
  small: { color: colors.text, fontSize: 13 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: '#2C3340' },
  grow: { flex: 1, gap: 3 },
  day: { color: colors.text, fontSize: 16, fontWeight: '700' },
  tick: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tickText: { color: colors.text, fontSize: 20, fontWeight: '700' },
  best: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'rgba(245,165,36,0.16)', borderRadius: 16, padding: 16, gap: 4 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#222833', overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  count: { color: colors.text, fontSize: 15, fontWeight: '700', minWidth: 40, textAlign: 'right' },
});
