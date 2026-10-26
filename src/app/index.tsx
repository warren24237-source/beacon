import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { AppState, KeyboardAvoidingView, Platform, type ScrollViewInstance, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import {
  ACTIVITIES,
  activityTitle,
  fetchCircles,
  fetchFriends,
  fetchFriendsBeacons,
  fetchMyBeacons,
  fmtRange,
  fmtTime,
  halfHourSlots,
  loadAudience,
  loadHidden,
  presetWindows,
  upcomingDays,
  whenLabel,
  type MyBeacon,
  saveAudience,
  saveHidden,
  type Circle,
  type Friend,
} from '@/lib/beacon';
import { BeaconGlow, UnlitLamp } from '@/lib/glow';
import { IncomingBeacon, type FriendBeacon } from '@/lib/incoming';
import { PollsHome } from '@/lib/pollsHome';
import { Sheet } from '@/lib/sheet';
import { enableMatchAlerts } from '@/lib/push';
import { PlaceRow, placeName, usePlaceNames, WherePicker } from '@/lib/placeui';
import { cachedPlace, type DraftPlace } from '@/lib/places';
import { ReplyIcons } from '@/lib/reply';
import { WhenTag } from '@/lib/when';
import { supabase } from '@/lib/supabase';
import { border, Button, Chip, Chips, colors, ErrorText, Label, shadow, Text, TextInput } from '@/lib/ui';


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

  const [mine, setMine] = useState<MyBeacon[]>([]);
  const [replacing, setReplacing] = useState<MyBeacon | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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
  const composerRef = useRef<ComposerHandle>(null);
  const [lighting, setLighting] = useState(false);
  const [lightError, setLightError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // One refresh at a time: the timer, app focus and notifications can all fire together.
  // A refresh asked for while one is running runs once straight after, so nothing is missed.
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const load = useCallback(async (): Promise<void> => {
    if (!userId) return;
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        const [m, inc, f, c, r] = await Promise.all([
          fetchMyBeacons(userId),
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
      } while (again.current);
    })();
    running.current = run;
    try {
      await run;
    } finally {
      running.current = null;
    }
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
            <View style={[styles.dot, !mine.length && styles.dotOff]} />
            <Text style={styles.wordmarkText}>Beacon</Text>
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
          {/* Warren's own test lane: updates land here before testers get them. */}
          {Updates.channel === 'staging' && <Text style={styles.lane}>Test lane</Text>}
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
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'now' ? 'Beacons' : 'Find a date'}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'date' && <PollsHome userId={userId} />}

        {tab === 'now' && (
          <View style={styles.hero}>
            {mine.length ? (
              <Pressable onPress={() => !composing && setComposing(true)} accessibilityRole="button" accessibilityLabel="Light another beacon">
                <BeaconGlow flash={justLit} />
              </Pressable>
            ) : (
              <UnlitLamp onPress={() => !composing && setComposing(true)} />
            )}
            {mine.length ? (
              <Text style={[styles.muted, styles.center]}>Tap the beacon to add another.</Text>
            ) : (
              <>
                <Text style={[styles.h1, styles.center]}>Free for something?</Text>
                <Text style={[styles.muted, styles.center, { marginTop: -10 }]}>Tap the beacon to light it.</Text>
              </>
            )}
          </View>
        )}

        {/* Your beacons, soonest first, each collapsed to one line with its status. Tap to open (decision 51). */}
        {tab === 'now' && mine.length > 0 && (
          <View style={styles.group}>
            <Label>{mine.length > 1 ? `Your beacons · ${mine.length} out` : 'Your beacon'}</Label>
            {mine.map((b) => (
              <MyBeaconCard
                key={b.id}
                beacon={b}
                open={openId === b.id}
                onToggle={() => setOpenId(openId === b.id ? null : b.id)}
                onChange={() => {
                  setReplacing(b);
                  setComposing(true);
                }}
                onOut={load}
              />
            ))}
          </View>
        )}

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
      <Sheet
        ref={scrollRef}
        visible={composing}
        onClose={() => {
          setComposing(false);
          setReplacing(null);
          setLightError('');
        }}
        footer={
          <View style={{ gap: 10 }}>
            <ErrorText>{lightError}</ErrorText>
            <Button label={replacing ? 'Update my beacon' : 'Light my beacon'} onPress={() => composerRef.current?.light()} busy={lighting} />
          </View>
        }>
        <Composer
          ref={composerRef}
          setBusy={setLighting}
          setError={setLightError}
          userId={userId}
          friends={friends}
          circles={circles}
          replacing={replacing}
          onNoteFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
          onScrollTo={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })}
          onLit={async () => {
            setComposing(false);
            setReplacing(null);
            setJustLit(true);
            setTimeout(() => setJustLit(false), 1500); // flash once, not again on the next visit
            await load();
          }}
        />
      </Sheet>
    </SafeAreaView>
  );
}

// Lighting a beacon ---------------------------------------------------------------

type ComposerHandle = { light: () => void };

// The light form. Its button lives in the sheet's pinned footer, which calls light() through the ref.
function Composer({
  ref,
  setBusy,
  setError,
  userId,
  friends,
  circles,
  replacing,
  onLit,
  onNoteFocus,
  onScrollTo,
}: {
  ref: Ref<ComposerHandle>;
  setBusy: (b: boolean) => void;
  setError: (e: string) => void;
  userId: string;
  friends: Friend[];
  circles: Circle[];
  replacing: MyBeacon | null;
  onLit: () => void;
  onNoteFocus?: () => void;
  onScrollTo?: (y: number) => void;
}) {
  const days = useMemo(() => upcomingDays(), []);
  const [day, setDay] = useState(() => {
    if (!replacing) return 0;
    const diff = Math.round((new Date(replacing.start_time).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return Math.min(6, Math.max(0, diff));
  });
  const presets = useMemo(() => presetWindows(day), [day]);
  const slots = useMemo(() => halfHourSlots(day), [day]);
  const [acts, setActs] = useState<string[]>(replacing?.activities ?? ['Drinks']);
  const [windowId, setWindowId] = useState(presets[0]?.id ?? 'custom');
  const [customStart, setCustomStart] = useState<Date | null>(slots[0] ?? null);
  const [customEnd, setCustomEnd] = useState<Date | null>(slots[3] ?? slots[slots.length - 1] ?? null);

  // Changing day: pick its first window and reset the custom times.
  const pickDay = (d: number) => {
    setDay(d);
    const p = presetWindows(d);
    const sl = halfHourSlots(d);
    setWindowId(d === 0 ? (p[0]?.id ?? 'custom') : (p.find((w) => w.id === 'tonight')?.id ?? p[0]?.id ?? 'custom'));
    setCustomStart(sl[0] ?? null);
    setCustomEnd(sl[3] ?? sl[sl.length - 1] ?? null);
  };
  const [audience, setAudience] = useState<string[]>(['everyone']);
  const [note, setNote] = useState(replacing?.note ?? '');
  const whereY = useRef(0);
  // Changing a beacon keeps its places (names from this session's cache).
  const [places, setPlaces] = useState<DraftPlace[]>(() =>
    [...(replacing?.beacon_places ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ placeId: p.place_id ?? undefined, label: p.label ?? undefined, name: placeName(p), area: p.place_id ? cachedPlace(p.place_id)?.area : undefined, starred: p.starred }))
  );

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
    enableMatchAlerts(userId); // usually already done when the app opened; never hold up the beacon for it
    const all = audience.includes('everyone');
    const { error } = await supabase.rpc('light_beacon', {
      p_activities: acts,
      p_note: note.trim(),
      p_start: chosen.start.toISOString(),
      p_end: chosen.end.toISOString(),
      p_all: all,
      p_circle_ids: all ? [] : audience,
      p_replace: replacing?.id ?? null,
      p_places: places.map((p) => (p.placeId ? { place_id: p.placeId, starred: p.starred } : { label: p.label, starred: p.starred })),
      p_place_names: places.map((p) => p.name),
    });
    setBusy(false);
    if (error) return setError(error.message);
    saveAudience(audience);
    onLit();
  }

  useImperativeHandle(ref, () => ({ light }));

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
        <Label>When</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4, paddingBottom: 4 }}>
          {days.map((d) => (
            <Pressable
              key={d.offset}
              onPress={() => pickDay(d.offset)}
              accessibilityRole="button"
              accessibilityState={{ selected: day === d.offset }}
              style={[styles.dayChip, day === d.offset && styles.dayChipOn]}>
              <Text style={styles.dayChipText}>{d.label}</Text>
              <Text style={styles.dayChipSub}>{d.sub}</Text>
            </Pressable>
          ))}
        </ScrollView>
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

      <View style={styles.group} onLayout={(e) => (whereY.current = e.nativeEvent.layout.y)}>
        <Label>{places.length ? `Where · optional · ${places.length} of 3` : 'Where · optional'}</Label>
        <WherePicker userId={userId} value={places} onChange={setPlaces} onFocus={() => setTimeout(() => onScrollTo?.(whereY.current), 250)} />
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

function MyBeaconCard({
  beacon,
  open,
  onToggle,
  onChange,
  onOut,
}: {
  beacon: MyBeacon;
  open: boolean;
  onToggle: () => void;
  onChange: () => void;
  onOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const start = new Date(beacon.start_time);
  const end = new Date(beacon.end_time);
  const when = whenLabel(start, end);
  const responders = beacon.responses.map((r) => r.profiles).filter(Boolean) as { full_name: string; phone_number: string | null }[];
  const places = [...(beacon.beacon_places ?? [])].sort((a, b) => a.position - b.position);
  usePlaceNames(places);
  const prefs = beacon.place_prefs ?? [];
  const nameOf = (id: string) => beacon.responses.find((r) => r.user_id === id)?.profiles?.full_name ?? '';
  const anyFine = prefs.filter((x) => x.position === null).map((x) => nameOf(x.user_id)).filter(Boolean);

  return (
    <View style={styles.mine}>
      {/* The one-line summary: what, when, how many are in. Tap to open or close. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${activityTitle(beacon.activities)}, ${when.text}, ${responders.length} in`}
        style={styles.mineHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.mineTitle} numberOfLines={1}>
            {activityTitle(beacon.activities)}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <WhenTag text={when.text} live={when.live} />
          </View>
        </View>
        <View style={[styles.status, responders.length ? styles.statusIn : styles.statusNone]}>
          <Text style={[styles.statusText, !responders.length && { color: colors.muted, fontWeight: '600' }]}>
            {responders.length ? `${responders.length} in` : 'Nobody yet'}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={styles.mineBody}>
          {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
          {places.length > 0 && (
            <View style={{ gap: 8 }}>
              {responders.length > 0 && <Label>Who prefers where</Label>}
              {places.map((p) => {
                const who = prefs.filter((x) => x.position === p.position).map((x) => nameOf(x.user_id)).filter(Boolean);
                return <PlaceRow key={p.position} place={p} tag={p.starred ? 'My pick' : undefined} right={responders.length ? (who.length ? who.join(', ') : 'nobody yet') : undefined} />;
              })}
              {anyFine.length > 0 && <Text style={styles.muted}>Any is fine: {anyFine.join(', ')}</Text>}
            </View>
          )}
          {responders.length ? (
            responders.map((p) => (
              // One line per person: small icons without labels (decision 42 exception), name shrinks if long.
              <View key={p.full_name + p.phone_number} style={styles.person}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.full_name[0]}</Text>
                </View>
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                  {p.full_name}
                </Text>
                <ReplyIcons name={p.full_name} phone={p.phone_number} compact />
              </View>
            ))
          ) : (
            <Text style={styles.muted}>You&apos;ll get a buzz when someone taps &quot;I&apos;m in&quot;.</Text>
          )}
          <View style={styles.mineActs}>
            <Pressable onPress={onChange} hitSlop={8} accessibilityRole="button">
              <Text style={styles.actLink}>Change</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              onPress={async () => {
                setBusy(true);
                await supabase.rpc('put_out_beacon', { p_beacon_id: beacon.id });
                setBusy(false);
                onOut();
              }}>
              <Text style={styles.actLink}>{busy ? 'Putting it out…' : 'Put it out'}</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  lane: { fontSize: 11, fontWeight: '800', color: colors.muted, borderWidth: 1.5, borderColor: colors.muted, borderStyle: 'dashed', paddingHorizontal: 5, marginLeft: 'auto', marginRight: 10 },
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  center: { textAlign: 'center' },
  hero: { gap: 14, paddingTop: 4, alignItems: 'center' },
  dayChip: { backgroundColor: colors.card, ...border, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  dayChipOn: { backgroundColor: colors.butter, ...shadow.select },
  dayChipText: { fontSize: 15, fontWeight: '600' },
  dayChipSub: { fontSize: 12, color: colors.muted },
  mine: { backgroundColor: colors.cream, ...border, ...shadow.card },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  mineBody: { gap: 10, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1.5, borderTopColor: colors.ink },
  status: { borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 2 },
  statusIn: { backgroundColor: colors.butter, ...shadow.select },
  statusNone: { borderColor: colors.muted, borderStyle: 'dashed' },
  statusText: { fontSize: 14, fontWeight: '800' },
  chevron: { fontSize: 16, color: colors.muted, width: 14, textAlign: 'center' },
  mineTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  mineActs: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  actLink: { color: colors.muted, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  pair: { flexDirection: 'row', gap: 12 },
  name: { fontSize: 16, fontWeight: '800' },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  body: { fontSize: 16 },
  input: {},
  quote: { fontSize: 15 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, ...border },
  avatar: { width: 32, height: 32, backgroundColor: colors.card, ...border, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
