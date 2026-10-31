import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { askCalendar, calendarAllowed, checkDates, type DayCheck } from '@/lib/busy';
import { fetchChatOverview, type ThreadInfo } from '@/lib/chat';
import { ChatRow } from '@/lib/chatui';
import { fetchPoll, fmtDay, pollLive, tally, todayYmd, type Poll } from '@/lib/polls';
import { NudgeList } from '@/lib/nudge';
import { Sheet } from '@/lib/sheet';
import { supabase } from '@/lib/supabase';
import { BackBar, border, Button, Card, colors, ErrorText, goBack, ScrollScreen, shadow, Text } from '@/lib/ui';

// One "Find a date": results for the organiser, ticking dates for everyone else.
export default function PollScreen() {
  const { id, answer } = useLocalSearchParams<{ id: string; answer?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined);
  const [editing, setEditing] = useState(answer === '1');
  const [mine, setMine] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cal, setCal] = useState<Record<string, DayCheck> | null>(null);
  const [calAllowed, setCalAllowed] = useState(false);
  const [calNote, setCalNote] = useState('');

  // Check the calendar against this poll's dates. When nothing is ticked yet, tick the free ones.
  const runCalendar = useCallback(
    async (p: Poll, tick: boolean) => {
      const res = await checkDates(p.dates, p.start_minute, p.end_minute);
      if (!res) return setCalNote("Couldn't read your calendar.");
      setCal(res);
      const free = p.dates.filter((d) => !res[d]?.busy.length);
      if (tick) {
        setMine(free);
        setCalNote(
          free.length
            ? `Ticked ${free.length} ${free.length === 1 ? 'date' : 'dates'} your calendar says you're free. Check and send.`
            : 'Your calendar has something on every date. Untick or tick as you like.'
        );
      }
    },
    []
  );

  const calChecked = useRef(false);
  const [chat, setChat] = useState<ThreadInfo | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const load = useCallback(async () => {
    const [p, ov] = await Promise.all([fetchPoll(id), fetchChatOverview()]);
    setPoll(p);
    setChat(ov[id]);
    if (!p) return;
    const myAnswers = p.poll_answers.filter((a) => a.user_id === userId).map((a) => a.day);
    const answeredBefore = !!p.poll_invitees.find((i) => i.user_id === userId)?.answered_at;
    setMine(myAnswers);
    const allowed = await calendarAllowed();
    setCalAllowed(allowed);
    if (allowed && !calChecked.current) {
      calChecked.current = true;
      runCalendar(p, !answeredBefore);
    }
  }, [id, userId, runCalendar]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const close = goBack;

  if (poll === undefined) return <ScrollScreen>{null}</ScrollScreen>;
  if (poll === null)
    return (
      <ScrollScreen>
        <BackBar title="Not found" />
        <Text style={styles.muted}>This one may have been deleted.</Text>
        <Button label="Back" secondary onPress={close} />
      </ScrollScreen>
    );

  const isOwner = poll.owner_id === userId;
  const me = poll.poll_invitees.find((i) => i.user_id === userId);
  const answered = !!me?.answered_at;
  const { rows, best, total, answered: answeredCount } = tally(poll);
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
  if (editing || (!isOwner && !answered)) {
    return (
      <ScrollScreen>
        <BackBar
          title={poll.title}
          sub={isOwner ? 'Your Find a day' : `From ${ownerName}`}
          onBack={editing && answered ? () => setEditing(false) : close}
          right={
            isOwner && !answered ? (
              <Pressable onPress={() => setEditing(false)} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Skip</Text>
              </Pressable>
            ) : undefined
          }
        />
        <Card>
          <Text style={styles.cardTitle}>{isOwner ? 'Your dates too' : `From ${ownerName}`}</Text>
          <Text style={styles.body}>{datesLine}</Text>
          <Text style={styles.muted}>{isOwner ? 'Tick the dates you can do. You count in the totals.' : 'Tap every date you can do.'}</Text>
        </Card>
        {!calAllowed && (
          <Card>
            <Text style={styles.cardTitle}>Check my calendar</Text>
            <Text style={styles.muted}>Ticks the dates you&apos;re free. Your calendar stays on your phone, only your ticks are shared.</Text>
            <Button
              label="Check my calendar"
              secondary
              onPress={async () => {
                const ok = await askCalendar();
                setCalAllowed(ok);
                if (!ok) return setCalNote('No problem. Tick the dates yourself.');
                calChecked.current = true;
                runCalendar(poll, !answered && mine.length === 0);
              }}
            />
          </Card>
        )}
        {calNote ? <Text style={styles.note}>{calNote}</Text> : null}
        <View style={styles.list}>
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
                  {cal?.[day]?.busy.length ? <Text style={styles.busy}>Busy: {cal[day].busy.join(', ')}</Text> : null}
                  {cal?.[day]?.allDay.length ? <Text style={styles.muted}>All day: {cal[day].allDay.join(', ')}</Text> : null}
                </View>
                <View style={[styles.tick, on && styles.tickOn]}>
                  <Text style={styles.tickText}>{on ? '✓' : ''}</Text>
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

  function confirmDelete() {
    Alert.alert(`Delete ${poll!.title}?`, "Everyone's answers go too. Nobody is told.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('polls').delete().eq('id', poll!.id);
          if (error) return setError(error.message);
          close();
        },
      },
    ]);
  }

  // Lock in a date (open question 25, decision 81): the organiser picks the day, everyone asked gets a buzz.
  async function lockDay(day: string | null) {
    setPicking(false);
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('lock_poll', { p_poll_id: poll!.id, p_day: day });
    setBusy(false);
    if (error) return setError(error.message);
    load();
  }
  const today = todayYmd();
  const live = pollLive(poll);
  const lockable = rows.filter((r) => r.day >= today);

  // Results: organiser, or invitee after answering.
  const shareText = `${poll.title}: ${fmtDay(best.day)}, ${poll.time_label.toLowerCase()} works for ${best.who.length} of ${total}${best.who.length ? ` (${best.who.join(', ')})` : ''}. Shall we lock it in?`;

  return (
    <ScrollScreen>
      <BackBar
        title={poll.title}
        sub={isOwner ? 'Your Find a day' : `From ${ownerName}`}
        right={
          !isOwner && live && !poll.locked_day ? (
            <Pressable onPress={() => setEditing(true)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.link}>Change</Text>
            </Pressable>
          ) : undefined
        }
      />
      <Text style={styles.muted}>
        {isOwner
          ? `${datesLine}. ${answeredCount} of ${total} answered.`
          : `${ownerName}'s been told. ` +
            (mine.length ? `You're free on ${mine.length} ${mine.length === 1 ? 'date' : 'dates'}.` : 'You said none of these work.')}
      </Text>

      {poll.locked_day ? (
        <View style={styles.locked}>
          <Text style={styles.lockedEyebrow}>LOCKED IN</Text>
          <Text style={styles.cardTitle}>
            {fmtDay(poll.locked_day)} · {poll.time_label}
          </Text>
          {(() => {
            const r = rows.find((x) => x.day === poll.locked_day);
            return r ? <Text style={styles.small}>{r.who.length ? `Free: ${r.who.join(', ')}` : 'Nobody said they were free that day.'}</Text> : null;
          })()}
          {isOwner && live && (
            <Pressable onPress={() => setPicking(true)} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.ink, textDecorationLine: 'underline' }]}>Change the date</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <ChatRow thread={{ pollId: poll.id }} title={poll.title} info={chat} />

      {isOwner && !poll.locked_day && best.who.length > 0 && (
        <>
          <View style={styles.best}>
            <Text style={styles.eyebrow}>Best so far</Text>
            <Text style={styles.cardTitle}>
              {fmtDay(best.day)} · {poll.time_label}
            </Text>
            <Text style={styles.small}>
              {best.who.length} of {total} free: {best.who.join(', ')}
            </Text>
          </View>
          {best.day >= today && <Button label={`Lock in ${fmtDay(best.day)}`} variant="butter" busy={busy} onPress={() => lockDay(best.day)} />}
          {lockable.length > 1 && (
            <Pressable onPress={() => setPicking(true)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
              <Text style={[styles.link, { textDecorationLine: 'underline' }]}>Lock in a different date</Text>
            </Pressable>
          )}
          <Button label="Share the best date" secondary onPress={() => Share.share({ message: shareText })} />
        </>
      )}
      {isOwner && best.who.length === 0 && <Text style={styles.body}>No answers yet. You&apos;ll get a notification as people answer.</Text>}

      <View style={styles.list}>
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
      {/* Nudge whoever hasn't ticked dates (decision 87), until a date is locked in. */}
      {isOwner && live && !poll.locked_day && (
        <NudgeList
          pollId={poll.id}
          people={poll.poll_invitees.filter((i) => !i.answered_at && i.user_id !== userId).map((i) => ({ id: i.user_id, name: i.profiles?.full_name ?? 'A friend' }))}
        />
      )}
      {isOwner && live && !poll.locked_day && <Button label={answered ? 'Change my dates' : 'Add my dates'} secondary onPress={() => setEditing(true)} />}
      {isOwner && (
        <Pressable onPress={confirmDelete} hitSlop={12} style={styles.deleteWrap} accessibilityRole="button">
          <Text style={styles.delete}>Delete this date request</Text>
        </Pressable>
      )}
      <ErrorText>{error}</ErrorText>

      <Sheet visible={picking} onClose={() => setPicking(false)} fit>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Text style={styles.cardTitle}>{poll.locked_day ? 'Change the date' : 'Lock in a date'}</Text>
          <Text style={styles.muted}>Everyone asked gets a buzz with the date.</Text>
          {lockable.map((r) => (
            <Pressable
              key={r.day}
              onPress={() => lockDay(r.day)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pick, poll.locked_day === r.day && { backgroundColor: colors.butter }, pressed && { boxShadow: 'none', transform: [{ translateX: 3 }, { translateY: 3 }] }]}>
              <Text style={[styles.day, { flex: 1 }]}>{fmtDay(r.day)}</Text>
              <Text style={styles.muted}>
                {r.who.length}/{total} free
              </Text>
            </Pressable>
          ))}
          {poll.locked_day && (
            <Pressable onPress={() => lockDay(null)} accessibilityRole="button" style={[styles.pick, styles.pickLater]}>
              <Text style={styles.day}>Not sure yet, unlock it</Text>
            </Pressable>
          )}
        </View>
      </Sheet>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  h1: { fontSize: 30, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7, flex: 1 },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600', paddingTop: 6 },
  muted: { color: colors.muted, fontSize: 14 },
  busy: { color: colors.error, fontSize: 13, fontWeight: '600' },
  deleteWrap: { alignItems: 'center', paddingVertical: 8 },
  delete: { color: colors.error, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  note: { fontSize: 14, fontWeight: '800' },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
  cardTitle: { fontSize: 19, fontWeight: '800' },
  list: { backgroundColor: colors.card, ...border, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  rowLine: { borderTopWidth: 2, borderTopColor: colors.ink },
  grow: { flex: 1, gap: 3 },
  day: { fontSize: 16, fontWeight: '800' },
  tick: { width: 44, height: 44, backgroundColor: colors.card, ...border, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.butter, ...shadow.select },
  tickText: { fontSize: 20, fontWeight: '800' },
  best: { backgroundColor: colors.butter, ...border, ...shadow.card, padding: 16, gap: 4 },
  locked: { backgroundColor: colors.butter, ...border, ...shadow.card, padding: 16, gap: 4 },
  lockedEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, alignSelf: 'flex-start', backgroundColor: colors.ink, color: colors.butter, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, ...border, ...shadow.select, paddingVertical: 12, paddingHorizontal: 12 },
  pickLater: { backgroundColor: colors.bg, borderStyle: 'dashed', boxShadow: 'none' },
  eyebrow: { fontSize: 13, fontWeight: '800' },
  bar: { height: 10, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.ink, overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%', backgroundColor: colors.accent },
  count: { fontSize: 15, fontWeight: '800', minWidth: 40, textAlign: 'right' },
});
