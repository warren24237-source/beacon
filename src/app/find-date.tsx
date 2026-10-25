import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { fetchCircles, fetchFriends, type Circle, type Friend } from '@/lib/beacon';
import { calendarAllowed, checkDates, type DayCheck } from '@/lib/busy';
import { Calendar } from '@/lib/calendar';
import { DAY_SLOTS, fmtDay, fmtMinutes, parseYmd, TIME_OPTIONS, todayYmd, weeklyDates, ymd } from '@/lib/polls';
import { enableMatchAlerts } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { Button, Chip, Chips, colors, ErrorText, Field, Label, ScrollScreen } from '@/lib/ui';

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function plusDays(day: string, n: number) {
  const d = parseYmd(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export default function FindDate() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [friends, setFriends] = useState<Friend[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'weekly' | 'pick'>('weekly');
  const [days, setDays] = useState<number[]>([6]);
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(plusDays(todayYmd(), 8 * 7));
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [time, setTime] = useState<(typeof TIME_OPTIONS)[number]['id']>('eve');
  const [cFrom, setCFrom] = useState(18 * 60);
  const [cTo, setCTo] = useState(21 * 60);
  const [audience, setAudience] = useState<string[]>(['everyone']);
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clashes, setClashes] = useState<Record<string, DayCheck> | null>(null);

  useEffect(() => {
    fetchFriends().then(setFriends);
    fetchCircles().then(setCircles);
  }, []);

  const dates = useMemo(
    () => (mode === 'weekly' ? weeklyDates(days, from, to) : [...picked].sort()),
    [mode, days, from, to, picked]
  );

  const timeLabel =
    time === 'custom' ? `${fmtMinutes(cFrom)} to ${fmtMinutes(cTo)}` : time === 'any' ? 'Any time' : TIME_OPTIONS.find((t) => t.id === time)!.range;

  const everyone = audience.includes('everyone');
  const chosen = everyone
    ? new Set(friends.map((f) => f.id))
    : new Set([...circles.filter((c) => audience.includes(c.id)).flatMap((c) => c.member_ids), ...people]);
  const window: [number | null, number | null] =
    time === 'custom' ? [cFrom, cTo] : time === 'day' ? [600, 1020] : time === 'eve' ? [1080, 1260] : [null, null];

  // Heads-up from your own calendar while you pick dates (only if you've already allowed it).
  const windowKey = `${window[0]}-${window[1]}`;
  const datesKey = dates.join(',');
  useEffect(() => {
    let live = true;
    calendarAllowed().then(async (ok) => {
      const res = ok ? await checkDates(dates, window[0], window[1]) : null;
      if (live) setClashes(res);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey, windowKey]);
  const busyDates = clashes ? dates.filter((d) => clashes[d]?.busy.length) : [];

  const count = [...chosen].filter((id) => friends.some((f) => f.id === id)).length;

  // Everyone, or any mix of circles and individual friends.
  const toggleAudience = (id: string) => {
    if (id === 'everyone') {
      setPeople([]);
      return setAudience(['everyone']);
    }
    const next = audience.filter((x) => x !== 'everyone');
    const after = next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
    setAudience(after.length || people.length ? after : ['everyone']);
  };
  const togglePerson = (id: string) => {
    const after = people.includes(id) ? people.filter((x) => x !== id) : [...people, id];
    setPeople(after);
    const circlesOnly = audience.filter((x) => x !== 'everyone');
    setAudience(after.length || circlesOnly.length ? circlesOnly : ['everyone']);
  };

  async function send() {
    setError('');
    if (!title.trim()) return setError("Give it a name so friends know what it's for.");
    if (!dates.length) return setError('Pick at least one date.');
    if (time === 'custom' && cTo <= cFrom) return setError('The end time needs to be after the start time.');
    if (!count) return setError(friends.length ? 'Nobody is in that circle yet.' : 'Add a friend first.');
    setBusy(true);
    await enableMatchAlerts(userId);
    const { data, error } = await supabase.rpc('create_poll', {
      p_title: title.trim(),
      p_dates: dates,
      p_time_label: timeLabel,
      p_all: everyone,
      p_circle_ids: everyone ? [] : audience,
      p_user_ids: everyone ? [] : people,
      p_start_minute: window[0],
      p_end_minute: window[1],
    });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(`/poll/${(data as { poll_id: string }).poll_id}?answer=1`);
  }

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Text style={styles.h1}>Find a date</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        <Label>WHAT&apos;S IT FOR?</Label>
        <Field value={title} onChangeText={setTitle} maxLength={40} placeholder="e.g. Christmas drinks" />
      </View>

      <View style={styles.group}>
        <Label>WHICH DATES</Label>
        <Chips>
          <Chip label="Every week" on={mode === 'weekly'} onPress={() => setMode('weekly')} />
          <Chip label="Pick dates" on={mode === 'pick'} onPress={() => setMode('pick')} />
        </Chips>
        {mode === 'weekly' ? (
          <>
            <Chips>
              {WEEK.map((d) => (
                <Chip
                  key={d}
                  label={DOW[d]}
                  on={days.includes(d)}
                  onPress={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}
                />
              ))}
            </Chips>
            <Chips>
              <Chip label="From" sub={fmtDay(from)} on={editing === 'from'} onPress={() => setEditing(editing === 'from' ? null : 'from')} />
              <Chip label="Until" sub={fmtDay(to)} on={editing === 'to'} onPress={() => setEditing(editing === 'to' ? null : 'to')} />
            </Chips>
            {editing && (
              <Calendar
                key={editing}
                selected={[editing === 'from' ? from : to]}
                onPress={(day) => {
                  if (editing === 'from') {
                    setFrom(day);
                    if (day > to) setTo(day);
                  } else {
                    setTo(day < from ? from : day);
                  }
                  setEditing(null);
                }}
              />
            )}
          </>
        ) : (
          <Calendar selected={picked} onPress={(day) => setPicked((p) => (p.includes(day) ? p.filter((x) => x !== day) : [...p, day]))} />
        )}
        <Text style={styles.muted}>
          {dates.length
            ? `${dates.length} ${dates.length === 1 ? 'date' : 'dates'}: ${dates.slice(0, 4).map(fmtDay).join(', ')}${dates.length > 4 ? ' …' : ''}`
            : 'No dates yet.'}
        </Text>
        {clashes && dates.length > 0 && (
          <Text style={busyDates.length ? styles.busy : styles.free}>
            {busyDates.length
              ? `Your calendar: busy on ${busyDates
                  .slice(0, 3)
                  .map((d) => `${fmtDay(d)} (${clashes[d].busy[0]})`)
                  .join(', ')}${busyDates.length > 3 ? ` and ${busyDates.length - 3} more` : ''}`
              : 'Your calendar: free on all of these.'}
          </Text>
        )}
      </View>

      <View style={styles.group}>
        <Label>WHAT TIME</Label>
        <Chips>
          {TIME_OPTIONS.map((t) => (
            <Chip key={t.id} label={t.label} sub={t.range || undefined} on={time === t.id} onPress={() => setTime(t.id)} />
          ))}
        </Chips>
        {time === 'custom' && (
          <View style={{ gap: 8 }}>
            <Text style={styles.muted}>From</Text>
            <SlotRow value={cFrom} onChange={setCFrom} />
            <Text style={styles.muted}>Until</Text>
            <SlotRow value={cTo} onChange={setCTo} />
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Label>
          WHO · {count} {count === 1 ? 'FRIEND' : 'FRIENDS'}
        </Label>
        <Chips>
          <Chip label="Everyone" on={audience.includes('everyone')} onPress={() => toggleAudience('everyone')} />
          {circles.map((c) => (
            <Chip key={c.id} label={c.name} on={audience.includes(c.id)} onPress={() => toggleAudience(c.id)} />
          ))}
        </Chips>
        {friends.length > 0 && (
          <>
            <Text style={styles.muted}>Or pick people</Text>
            <Chips>
              {friends.map((f) => (
                <Chip key={f.id} label={f.full_name} on={!everyone && chosen.has(f.id)} onPress={() => togglePerson(f.id)} />
              ))}
            </Chips>
          </>
        )}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button label={`Ask ${count} ${count === 1 ? 'friend' : 'friends'}`} onPress={send} busy={busy} />
    </ScrollScreen>
  );
}

function SlotRow({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {DAY_SLOTS.map((m) => (
        <Chip key={m} label={fmtMinutes(m)} on={value === m} onPress={() => onChange(m)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800' },
  link: { color: colors.muted, fontSize: 15 },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  busy: { color: colors.error, fontSize: 14 },
  free: { color: colors.whatsapp, fontSize: 14 },
});
