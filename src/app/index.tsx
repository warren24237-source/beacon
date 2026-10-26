import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, type ScrollViewInstance, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import {
  ACTIVITIES,
  activityTitle,
  fetchCircles,
  fetchFriends,
  fetchFriendsBeacons,
  fetchMyBeacon,
  fmtRange,
  fmtTime,
  halfHourSlots,
  loadAudience,
  loadHidden,
  presetWindows,
  saveAudience,
  saveHidden,
  type Circle,
  type Friend,
} from '@/lib/beacon';
import { BeaconGlow, UnlitLamp } from '@/lib/glow';
import { IncomingBeacon, type FriendBeacon } from '@/lib/incoming';
import { PollsHome } from '@/lib/pollsHome';
import { enableMatchAlerts } from '@/lib/push';
import { ReplyIcons } from '@/lib/reply';
import { supabase } from '@/lib/supabase';
import { Body, border, Button, Chip, Chips, colors, ErrorText, Label, shadow, Text, TextInput } from '@/lib/ui';

type MyBeacon = Awaited<ReturnType<typeof fetchMyBeacon>>;

const handledTaps = new Set<string>();
// Not available in browsers (only used for screenshots there).
const useLastTap = Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse;

function openPollFrom(res: Notifications.NotificationResponse) {
  const key = res.notification.request.identifier;
  const data = res.notification.request.content.data as { type?: string; poll_id?: string } | undefined;
  if (data?.type === 'poll' && data.poll_id && !handledTaps.has(key)) {
    handledTaps.add(key);
    router.push(`/poll/${data.poll_id}`);
  }
}

export default function Home() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [mine, setMine] = useState<MyBeacon>(null);
  const [incoming, setIncoming] = useState<FriendBeacon[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [composing, setComposing] = useState(false);
  const [justLit, setJustLit] = useState(false);
  // Beacons answered while on home stay a moment so you can message them, then leave home (decision 44).
  const [answeredNow, setAnsweredNow] = useState<string[]>([]);
  const [tab, setTab] = useState<'now' | 'date'>('now');
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [m, inc, f, c, r] = await Promise.all([
      fetchMyBeacon(userId),
      fetchFriendsBeacons(userId),
      fetchFriends(),
      fetchCircles(),
      supabase.rpc('incoming_friend_requests'),
    ]);
    setRequestCount((r.data ?? []).length);
    setMine(m);
    setIncoming(inc);
    setFriends(f);
    setCircles(c);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => {
        clearInterval(t);
        setAnsweredNow([]);
      };
    }, [load])
  );

  useEffect(() => {
    loadHidden().then(setHidden);
  }, []);

  // Opened from a "Find a date" notification while the app was closed: go to it, once.
  const lastTap = useLastTap();
  useEffect(() => {
    if (lastTap) openPollFrom(lastTap);
  }, [lastTap]);

  // Sign this phone up for notifications straight away, so friends' beacons reach it
  // even if it has never lit one. Android only asks once.
  useEffect(() => {
    if (userId) enableMatchAlerts(userId);
  }, [userId]);

  useEffect(() => {
    const a = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
      else setAnsweredNow([]);
    });
    const n = Notifications.addNotificationReceivedListener(() => load());
    const r = Notifications.addNotificationResponseReceivedListener((res) => {
      openPollFrom(res);
      load();
    });
    return () => {
      a.remove();
      n.remove();
      r.remove();
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isIn = (b: FriendBeacon) => b.responses.some((r) => r.user_id === userId);
  // Home only shows beacons still waiting on you. Answered and hidden ones live in Lit now.
  const waiting = incoming.filter((b) => !hidden.includes(b.id) && (!isIn(b) || answeredNow.includes(b.id)));

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <View style={styles.top}>
          <View style={styles.wordmark}>
            <View style={[styles.dot, !mine && styles.dotOff]} />
            <Text style={styles.wordmarkText}>beacon</Text>
            {incoming.length > 0 ? (
              <Pressable
                onPress={() => router.push('/lit')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${incoming.length} friends lit, see all`}
                style={styles.litFlag}>
                <Text style={styles.litFlagText}>{incoming.length} lit</Text>
              </Pressable>
            ) : (
              <View style={[styles.litFlag, styles.litFlagNone]}>
                <Text style={[styles.litFlagText, { color: colors.muted, fontWeight: '600' }]}>None lit</Text>
              </View>
            )}
          </View>
          <Pressable onPress={() => router.push('/friends')} hitSlop={12}>
            <Text style={[styles.link, requestCount > 0 && { color: colors.ink, fontWeight: '800' }]}>
              {requestCount > 0 ? `Friends · ${requestCount} new` : `Friends (${friends.length})`}
            </Text>
          </Pressable>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {(['now', 'date'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}>
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'now' ? 'Free now' : 'Find a date'}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'date' && <PollsHome userId={userId} />}

        {tab === 'now' &&
          (mine ? (
            <LitBeacon beacon={mine} flash={justLit} onChange={() => setComposing(true)} onOut={load} />
          ) : (
            <View style={styles.hero}>
              <UnlitLamp onPress={() => setComposing(true)} />
              <Text style={[styles.h1, styles.center]}>Free for something?</Text>
              <Text style={[styles.muted, styles.center, { marginTop: -10 }]}>Tap the beacon to light it.</Text>
            </View>
          ))}

        {tab === 'now' && waiting.length > 0 && (
          <View style={styles.group}>
            <Label>Waiting on you</Label>
            {waiting.map((b) => (
              <IncomingBeacon
                key={b.id}
                beacon={b}
                meIn={isIn(b)}
                onDone={() => {
                  setAnsweredNow((a) => [...a, b.id]);
                  load();
                }}
                onDismiss={() => setAnsweredNow((a) => a.filter((x) => x !== b.id))}
                onHide={() =>
                  setHidden((h) => {
                    const next = [...h, b.id];
                    saveHidden(next);
                    return next;
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Lighting a beacon: a sheet that slides up from the lamp (decision 43). */}
      <Modal visible={composing} transparent animationType="slide" onRequestClose={() => setComposing(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.sheetWrap}>
          <Pressable style={{ flex: 1 }} onPress={() => setComposing(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <View style={styles.grab} />
            <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <Composer
                userId={userId}
                friends={friends}
                circles={circles}
                replacing={!!mine}
                onNoteFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                onCancel={() => setComposing(false)}
                onLit={async () => {
                  setComposing(false);
                  setJustLit(true);
                  await load();
                }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Lighting a beacon ---------------------------------------------------------------

function Composer({
  userId,
  friends,
  circles,
  replacing,
  onCancel,
  onLit,
  onNoteFocus,
}: {
  userId: string;
  friends: Friend[];
  circles: Circle[];
  replacing: boolean;
  onCancel?: () => void;
  onLit: () => void;
  onNoteFocus?: () => void;
}) {
  const presets = useMemo(() => presetWindows(), []);
  const slots = useMemo(() => halfHourSlots(), []);
  const [acts, setActs] = useState<string[]>(['Drinks']);
  const [windowId, setWindowId] = useState(presets[0]?.id ?? 'custom');
  const [customStart, setCustomStart] = useState<Date | null>(slots[0] ?? null);
  const [customEnd, setCustomEnd] = useState<Date | null>(slots[3] ?? slots[slots.length - 1] ?? null);
  const [audience, setAudience] = useState<string[]>(['everyone']);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAudience().then((a) => {
      const valid = a.filter((x) => x === 'everyone' || circles.some((c) => c.id === x));
      setAudience(valid.length ? valid : ['everyone']);
    });
  }, [circles]);

  const toggleAct = (a: string) => {
    if (a === 'Anything') return setActs((p) => (p.includes('Anything') ? [] : ['Anything']));
    setActs((p) => {
      const base = p.filter((x) => x !== 'Anything');
      return base.includes(a) ? base.filter((x) => x !== a) : [...base, a];
    });
  };

  const toggleAudience = (id: string) => {
    if (id === 'everyone') return setAudience(['everyone']);
    setAudience((p) => {
      const base = p.filter((x) => x !== 'everyone');
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return next.length ? next : ['everyone'];
    });
  };

  const recipientCount = audience.includes('everyone')
    ? friends.length
    : new Set(circles.filter((c) => audience.includes(c.id)).flatMap((c) => c.member_ids)).size;

  const chosen = windowId === 'custom' ? { start: customStart, end: customEnd } : presets.find((p) => p.id === windowId);

  async function light() {
    setError('');
    if (!acts.length) return setError('Pick at least one thing you are up for.');
    if (!chosen?.start || !chosen?.end || chosen.end <= chosen.start) return setError('The end time needs to be after the start time.');
    if (!friends.length) return setError('Add a friend first. Tap Friends at the top.');
    if (!recipientCount) return setError('Nobody is in that circle yet. Add friends to it in Friends.');

    setBusy(true);
    await enableMatchAlerts(userId);
    const all = audience.includes('everyone');
    const { error } = await supabase.rpc('light_beacon', {
      p_activities: acts,
      p_note: note.trim(),
      p_start: chosen.start.toISOString(),
      p_end: chosen.end.toISOString(),
      p_all: all,
      p_circle_ids: all ? [] : audience,
    });
    setBusy(false);
    if (error) return setError(error.message);
    saveAudience(audience);
    onLit();
  }

  return (
    <View style={{ gap: 18 }}>
      {replacing && <Text style={styles.h2}>Change your beacon</Text>}

      <View style={styles.group}>
        <Label>What are you up for</Label>
        <Chips>
          {ACTIVITIES.map((a) => (
            <Chip key={a} label={a} on={acts.includes(a)} onPress={() => toggleAct(a)} />
          ))}
        </Chips>
      </View>

      <View style={styles.group}>
        <Label>When · today</Label>
        <Chips>
          {presets.map((p) => (
            <Chip key={p.id} label={p.label} sub={fmtRange(p.start, p.end)} on={windowId === p.id} onPress={() => setWindowId(p.id)} />
          ))}
          <Chip label="Pick times" on={windowId === 'custom'} onPress={() => setWindowId('custom')} />
        </Chips>
        {windowId === 'custom' && (
          <View style={{ gap: 8 }}>
            <Text style={styles.muted}>From</Text>
            <SlotRow slots={slots} value={customStart} onChange={setCustomStart} />
            <Text style={styles.muted}>Until</Text>
            <SlotRow slots={slots} value={customEnd} onChange={setCustomEnd} />
          </View>
        )}
      </View>

      <View style={styles.group}>
        <Label>
          Who · {recipientCount} {recipientCount === 1 ? 'friend' : 'friends'}
        </Label>
        <Chips>
          <Chip label="Everyone" on={audience.includes('everyone')} onPress={() => toggleAudience('everyone')} />
          {circles.map((c) => (
            <Chip key={c.id} label={c.name} on={audience.includes(c.id)} onPress={() => toggleAudience(c.id)} />
          ))}
        </Chips>
      </View>

      <View style={styles.group}>
        <Label>Note · optional</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          onFocus={onNoteFocus}
          maxLength={80}
          placeholder="e.g. Anyone fancy the Christmas market?"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>

      <ErrorText>{error}</ErrorText>
      <Button label={replacing ? 'Update my beacon' : 'Light my beacon'} onPress={light} busy={busy} />
      {onCancel && <Button label="Cancel" secondary onPress={onCancel} />}
    </View>
  );
}

function SlotRow({ slots, value, onChange }: { slots: Date[]; value: Date | null; onChange: (d: Date) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {slots.map((s) => (
        <Chip key={s.toISOString()} label={fmtTime(s)} on={value?.getTime() === s.getTime()} onPress={() => onChange(s)} />
      ))}
    </ScrollView>
  );
}

// My lit beacon ----------------------------------------------------------------

function LitBeacon({ beacon, flash, onChange, onOut }: { beacon: NonNullable<MyBeacon>; flash?: boolean; onChange: () => void; onOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const start = new Date(beacon.start_time);
  const end = new Date(beacon.end_time);
  const responders = beacon.responses.map((r) => r.profiles).filter(Boolean) as { full_name: string; phone_number: string | null }[];
  const replyText = `Saw you're in! ${fmtRange(start, end)} works for me. Where do you fancy?`;

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.hero}>
        <BeaconGlow flash={flash} />
        <Text style={[styles.h1, styles.center]}>You&apos;re lit</Text>
        <Text style={[styles.muted, styles.center, { marginTop: -10 }]}>
          {activityTitle(beacon.activities)} · {fmtRange(start, end)}
        </Text>
        {beacon.note ? <Text style={[styles.quote, styles.center]}>“{beacon.note}”</Text> : null}
      </View>

      <View style={styles.group}>
        <Label>{responders.length ? `${responders.length} in` : "Who's in"}</Label>
        {responders.length ? (
          responders.map((p) => (
            <View key={p.full_name + p.phone_number} style={styles.person}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.full_name[0]}</Text>
              </View>
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                {p.full_name}
              </Text>
              <ReplyIcons name={p.full_name} phone={p.phone_number} text={replyText} compact />
            </View>
          ))
        ) : (
          <Body muted>Nobody yet. You&apos;ll get a buzz when someone taps &quot;I&apos;m in&quot;. Goes out on its own at {fmtTime(end)}.</Body>
        )}
      </View>

      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Button label="Change" secondary onPress={onChange} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Put it out"
            secondary
            busy={busy}
            onPress={async () => {
              setBusy(true);
              await supabase.rpc('put_out_beacon');
              setBusy(false);
              onOut();
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 22, gap: 20, paddingBottom: 48 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmarkText: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.ink },
  dotOff: { backgroundColor: colors.card },
  litFlag: { marginLeft: 6, backgroundColor: colors.butter, ...border, borderRadius: 3, ...shadow.select, paddingVertical: 1, paddingHorizontal: 8 },
  litFlagNone: { backgroundColor: 'transparent', borderColor: colors.muted, boxShadow: 'none' },
  litFlagText: { fontSize: 13, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, ...border, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabOn: { backgroundColor: colors.ink },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: colors.bg, fontWeight: '800' },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  center: { textAlign: 'center' },
  hero: { gap: 14, paddingTop: 4 },
  pair: { flexDirection: 'row', gap: 12 },
  name: { fontSize: 16, fontWeight: '800' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(22,22,22,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopWidth: 2, borderColor: colors.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 22, paddingTop: 10, maxHeight: '90%' },
  grab: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.ink, opacity: 0.4, marginBottom: 14 },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  body: { fontSize: 16 },
  input: {},
  quote: { fontSize: 15 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: colors.card, ...border },
  avatar: { width: 36, height: 36, backgroundColor: colors.card, ...border, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
