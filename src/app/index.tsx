import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { AppState, KeyboardAvoidingView, Platform, type ScrollViewInstance, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import {
  ACTIVITIES,
  activityOptions,
  activityTitle,
  beaconPreview,
  cleanActivity,
  fetchCircles,
  fetchFriends,
  fetchFriendsBeacons,
  fetchMyBeacons,
  fmtRange,
  fmtTime,
  halfHourSlots,
  namesList,
  loadHidden,
  presetWindows,
  upcomingDays,
  whenLabel,
  type MyBeacon,
  saveHidden,
  type Circle,
  type Friend,
} from '@/lib/beacon';
import { BeaconGlow, LampButton, UnlitLamp } from '@/lib/glow';
import { LampFork } from '@/lib/fork';
import { IncomingBeacon, type FriendBeacon } from '@/lib/incoming';
import { fetchPolls, type Poll } from '@/lib/polls';
import { PollRow, splitPolls } from '@/lib/pollsHome';
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

const LAMP_TAPPED = 'beacon:lampTapped';

export default function Home() {
  const { session, profile } = useAuth();
  const myName = profile?.full_name ?? '';
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
  const [polls, setPolls] = useState<Poll[]>([]);
  // The lamp forks into "Up for something" and "Find a day" (decision 69).
  const [forked, setForked] = useState(false);
  // One-off "Tap the beacon" hint until the lamp has been tapped once on this phone (decision 71).
  const [hint, setHint] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState('');
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
        const [m, inc, f, c, r, pl] = await Promise.all([
          fetchMyBeacons(userId),
          fetchFriendsBeacons(userId),
          fetchFriends(),
          fetchCircles(),
          supabase.rpc('incoming_friend_requests'),
          fetchPolls(),
        ]);
        setPolls(pl);
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
    AsyncStorage.getItem(LAMP_TAPPED)
      .then((v) => setHint(!v))
      .catch(() => {});
  }, []);

  const onComposerState = useCallback((r: boolean, p: string) => {
    setReady(r);
    setPreview(p);
  }, []);

  const tapLamp = () => {
    if (composing) return;
    setForked((f) => !f);
    if (hint) {
      setHint(false);
      AsyncStorage.setItem(LAMP_TAPPED, '1').catch(() => {});
    }
  };

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
  const pollLists = splitPolls(polls, userId);
  const alone = !mine.length && !pollLists.plans.length && !waiting.length && !pollLists.waiting.length;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, alone && !forked && { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <View style={styles.top}>
          <View style={styles.wordmark}>
            <View style={[styles.dot, !mine.length && styles.dotOff]} />
            <Text style={styles.wordmarkText}>Beacon</Text>
            {/* Friends' lit beacons, including hidden and answered ones. Nothing shows when none are lit. */}
            {incoming.length > 0 && (
              <Pressable
                onPress={() => router.push('/lit')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${incoming.length} friends lit, see all`}
                style={styles.litFlag}>
                <Text style={styles.litFlagText}>{incoming.length} lit</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.push('/friends')} hitSlop={12}>
            <Text style={[styles.link, requestCount > 0 && { color: colors.ink, fontWeight: '800' }]}>
              {requestCount > 0 ? `Friends · ${requestCount} new` : `Friends (${friends.length})`}
            </Text>
          </Pressable>
        </View>

        {/* No words around the lamp (decision 71). It sits alone in the middle when there's nothing else. */}
        <View style={[styles.hero, alone && !forked && styles.heroAlone]}>
          {mine.length ? (
            <Pressable onPress={tapLamp} accessibilityRole="button" accessibilityLabel="Make a plan" accessibilityState={{ expanded: forked }}>
              <BeaconGlow flash={justLit} size={alone ? 170 : 140} />
            </Pressable>
          ) : (
            <UnlitLamp onPress={tapLamp} size={alone && !forked ? 170 : 140} nudge={!forked} />
          )}
          {hint && alone && !forked && <Text style={[styles.muted, styles.center]}>Tap the beacon</Text>}
          {forked && (
            <LampFork
              name={myName}
              onNow={() => {
                setForked(false);
                setComposing(true);
              }}
              onPlan={() => {
                setForked(false);
                router.push('/find-date');
              }}
            />
          )}
        </View>

        <View style={{ gap: 20 }}>
          {/* Your plans: your beacons soonest first, each collapsed to one line (decision 51), then your Find a date asks. */}
          {(mine.length > 0 || pollLists.plans.length > 0) && (
            <View style={styles.group}>
              <Label>Your plans</Label>
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
              {pollLists.plans.map((p) => (
                <PollRow key={p.id} poll={p} userId={userId} />
              ))}
            </View>
          )}

          {(waiting.length > 0 || pollLists.waiting.length > 0) && (
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
              {pollLists.waiting.map((p) => (
                <PollRow key={p.id} poll={p} userId={userId} />
              ))}
            </View>
          )}

          {/* While the lamp is forked, everything else dims; a tap anywhere on it folds the fork back. */}
          {forked && <Pressable style={styles.dim} onPress={() => setForked(false)} accessibilityLabel="Close" accessibilityRole="button" />}
        </View>
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
          setReady(false);
        }}
        footer={
          // Decision 70: no words on the button, just the lamp. The line above says what's missing, then what friends get.
          <View style={{ gap: 6, alignItems: 'center' }}>
            <ErrorText>{lightError}</ErrorText>
            <Text style={[styles.muted, styles.center]} numberOfLines={2}>
              {ready ? (
                <>
                  Friends get: <Text style={styles.previewText}>&ldquo;{preview}&rdquo;</Text>
                </>
              ) : (
                preview
              )}
            </Text>
            <LampButton ready={ready} busy={lighting} onPress={() => composerRef.current?.light()} />
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
          myName={myName}
          onState={onComposerState}
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
// Nothing is picked to start with (decision 70): What, When and Who are chosen every time.
function Composer({
  ref,
  setBusy,
  setError,
  userId,
  friends,
  circles,
  replacing,
  myName,
  onState,
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
  myName: string;
  onState: (ready: boolean, preview: string) => void;
  onLit: () => void;
  onNoteFocus?: () => void;
  onScrollTo?: (y: number) => void;
}) {
  const days = useMemo(() => upcomingDays(), []);
  // Changing a beacon starts from that beacon; a new one starts empty.
  const [day, setDay] = useState<number | null>(() => {
    if (!replacing) return null;
    const diff = Math.round((new Date(replacing.start_time).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return Math.min(6, Math.max(0, diff));
  });
  const presets = useMemo(() => (day === null ? [] : presetWindows(day)), [day]);
  const slots = useMemo(() => (day === null ? [] : halfHourSlots(day)), [day]);
  const [acts, setActs] = useState<string[]>(replacing?.activities ?? []);
  const [windowId, setWindowId] = useState<string | null>(() => {
    if (!replacing) return null;
    const s0 = new Date(replacing.start_time).getTime();
    const e0 = new Date(replacing.end_time).getTime();
    const d = Math.round((new Date(replacing.start_time).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    return presetWindows(Math.min(6, Math.max(0, d))).find((w) => w.start.getTime() === s0 && w.end.getTime() === e0)?.id ?? null;
  });
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);

  // Changing day clears the time, so nothing is picked for you.
  const pickDay = (d: number) => {
    if (d === day) return;
    setDay(d);
    setWindowId(null);
    setCustomStart(null);
    setCustomEnd(null);
  };
  const [audience, setAudience] = useState<string[]>(() =>
    !replacing ? [] : (replacing as MyBeacon & { audience_all?: boolean }).audience_all ? ['everyone'] : ((replacing as MyBeacon & { audience_circle_ids?: string[] }).audience_circle_ids ?? [])
  );
  const [note, setNote] = useState(replacing?.note ?? '');
  const whereY = useRef(0);
  // Changing a beacon keeps its places (names from this session's cache).
  const [places, setPlaces] = useState<DraftPlace[]>(() =>
    [...(replacing?.beacon_places ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ placeId: p.place_id ?? undefined, label: p.label ?? undefined, name: placeName(p), area: p.place_id ? cachedPlace(p.place_id)?.area : undefined, starred: p.starred }))
  );

  // Recents (decision 69): what you picked on your last few beacons, shown first with a clock.
  const [history, setHistory] = useState<string[][]>([]);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('beacons')
      .select('activities')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setHistory((data ?? []).map((r: { activities: string[] }) => r.activities ?? [])));
  }, [userId]);
  const options = useMemo(() => {
    const base = activityOptions(history, ACTIVITIES);
    // Anything typed this time (or on the beacon being changed) that isn't in the row yet goes first.
    const extra = acts.filter((a) => !base.some((o) => o.label.toLowerCase() === a.toLowerCase())).map((label) => ({ label, recent: false }));
    return [...extra, ...base];
  }, [history, acts]);

  // "+ Your own": a small box in place of the chip, 20 characters (decision 69).
  const [typing, setTyping] = useState(false);
  const [own, setOwn] = useState('');
  const addOwn = () => {
    const v = cleanActivity(own);
    setTyping(false);
    setOwn('');
    if (!v) return;
    setActs((p) => [...p.filter((x) => x !== 'Anything' && x.toLowerCase() !== v.toLowerCase()), v]);
  };

  const toggleAct = (a: string) => {
    if (a === 'Anything') return setActs((p) => (p.includes('Anything') ? [] : ['Anything']));
    setActs((p) => {
      const base = p.filter((x) => x !== 'Anything');
      return base.includes(a) ? base.filter((x) => x !== a) : [...base, a];
    });
  };

  const toggleAudience = (id: string) => {
    if (id === 'everyone') return setAudience((p) => (p.includes('everyone') ? [] : ['everyone']));
    setAudience((p) => {
      const base = p.filter((x) => x !== 'everyone');
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  // Who it actually reaches, by name, each person once (27 Oct): circles alone don't say who's in them.
  const recipients = useMemo(() => {
    if (audience.includes('everyone')) return friends.map((f) => f.full_name);
    const ids: string[] = [];
    audience.forEach((cid) => circles.find((c) => c.id === cid)?.member_ids.forEach((m) => !ids.includes(m) && ids.push(m)));
    return ids.map((id) => friends.find((f) => f.id === id)?.full_name).filter(Boolean) as string[];
  }, [audience, circles, friends]);
  const recipientCount = recipients.length;

  const chosen = windowId === 'custom' ? { start: customStart, end: customEnd } : presets.find((p) => p.id === windowId);
  const hasWhen = !!chosen?.start && !!chosen?.end && chosen.end > chosen.start;

  // Tell the footer whether the lamp can light, and what to say above it.
  const missing = [!acts.length && 'what', !hasWhen && 'when', !audience.length && 'who'].filter(Boolean) as string[];
  const ready = !missing.length;
  const preview = ready && chosen?.start && chosen?.end
    ? beaconPreview(myName || 'You', acts, chosen.start, chosen.end)
    : `Pick ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0]}.`;
  useEffect(() => {
    onState(ready, preview);
  }, [ready, preview, onState]);

  async function light() {
    setError('');
    if (!ready || !chosen?.start || !chosen?.end) return setError(`Pick ${missing.join(', ')} first.`);
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
    onLit();
  }

  useImperativeHandle(ref, () => ({ light }));

  return (
    <View style={{ gap: 18 }}>
      {replacing && <Text style={styles.h2}>Change your beacon</Text>}

      <View style={styles.group}>
        <Label>What are you up for</Label>
        <Chips>
          {options.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              on={acts.includes(o.label)}
              onPress={() => toggleAct(o.label)}
              icon={o.recent ? <Ionicons name="time-outline" size={14} color={colors.muted} accessibilityLabel="Recent" /> : undefined}
            />
          ))}
          {typing ? (
            <View style={styles.ownBox}>
              <TextInput
                value={own}
                onChangeText={setOwn}
                autoFocus
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={addOwn}
                onBlur={addOwn}
                placeholder="e.g. Padel, a walk"
                placeholderTextColor={colors.muted}
                style={styles.ownInput}
                accessibilityLabel="Your own activity"
              />
              <Pressable onPress={addOwn} style={styles.ownAdd} accessibilityRole="button">
                <Text style={styles.ownAddText}>Add</Text>
              </Pressable>
            </View>
          ) : (
            <Chip label="+ Your own" dashed onPress={() => setTyping(true)} />
          )}
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
        {/* A day first, then its times. */}
        {day !== null && (
          <Chips>
            {presets.map((p) => (
              <Chip key={p.id} label={p.label} sub={fmtRange(p.start, p.end)} on={windowId === p.id} onPress={() => setWindowId(p.id)} />
            ))}
            <Chip label="Pick times" on={windowId === 'custom'} onPress={() => setWindowId('custom')} />
          </Chips>
        )}
        {day !== null && windowId === 'custom' && (
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
        <Label>Who</Label>
        <Chips>
          <Chip label="Everyone" on={audience.includes('everyone')} onPress={() => toggleAudience('everyone')} />
          {circles.map((c) => (
            <Chip key={c.id} label={c.name} on={audience.includes(c.id)} onPress={() => toggleAudience(c.id)} />
          ))}
        </Chips>
        {audience.length > 0 && (
          <Text style={styles.muted}>
            {recipients.length ? (
              <>
                Goes to: <Text style={styles.goesNames}>{namesList(recipients)}</Text>
              </>
            ) : (
              'Nobody is in that circle yet.'
            )}
          </Text>
        )}
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
  const locked = !!beacon.locked_at;
  const firstNames = responders.map((p) => p.full_name);
  const onlyWho = firstNames.length <= 1 ? firstNames.join('') : `${firstNames.slice(0, -1).join(', ')} and ${firstNames[firstNames.length - 1]}`;
  const act = async (fn: string, done?: () => void) => {
    setBusy(true);
    await supabase.rpc(fn, { p_beacon_id: beacon.id });
    setBusy(false);
    (done ?? onOut)();
  };

  return (
    <View style={styles.mine}>
      {/* The one-line summary: what, when, how many are in. Tap to open or close. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${activityTitle(beacon.activities)}, ${when.text}, ${locked ? 'locked in' : `${responders.length} in`}`}
        style={styles.mineHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.mineTitle} numberOfLines={1}>
            {activityTitle(beacon.activities)}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <WhenTag text={when.text} live={when.live} />
          </View>
        </View>
        <View style={[styles.status, locked ? styles.statusLocked : responders.length ? styles.statusIn : styles.statusNone]}>
          <Text style={[styles.statusText, locked && { color: colors.butter }, !locked && !responders.length && { color: colors.muted, fontWeight: '600' }]}>
            {locked ? 'Locked in' : responders.length ? `${responders.length} in` : 'Nobody yet'}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={styles.mineBody}>
          {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
          {locked && <Text style={styles.muted}>Locked in. Only {onlyWho} can see it, and nobody new can join.</Text>}
          {places.length > 0 && (
            <View style={{ gap: 8 }}>
              {responders.length > 0 && <Label>Who prefers where</Label>}
              {places.map((p) => {
                const who = prefs.filter((x) => x.position === p.position).map((x) => nameOf(x.user_id)).filter(Boolean);
                return <PlaceRow key={p.position} place={p} tag={p.suggested_by ? `${nameOf(p.suggested_by) || 'A friend'}'s idea` : p.starred ? 'My pick' : undefined} right={responders.length ? (who.length ? who.join(', ') : 'nobody yet') : undefined} />;
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
          {!locked && responders.length > 0 && (
            // Decision 61: one tap, no confirm, because Unlock undoes it.
            <Button label="Lock it in" variant="butter" compact busy={busy} onPress={() => act('lock_beacon')} />
          )}
          <View style={styles.mineActs}>
            {locked ? (
              <Pressable disabled={busy} onPress={() => act('unlock_beacon')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.actLink}>Unlock</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onChange} hitSlop={8} accessibilityRole="button">
                <Text style={styles.actLink}>Change</Text>
              </Pressable>
            )}
            <Pressable disabled={busy} hitSlop={8} accessibilityRole="button" onPress={() => act('put_out_beacon')}>
              <Text style={styles.actLink}>{busy ? 'One moment…' : locked ? 'Call it off' : 'Put it out'}</Text>
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
  litFlagText: { fontSize: 13, fontWeight: '800' },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  center: { textAlign: 'center' },
  hero: { gap: 14, paddingTop: 4, alignItems: 'center' },
  heroAlone: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
  dim: { position: 'absolute', top: -10, left: -22, right: -22, bottom: -48, backgroundColor: colors.bg, opacity: 0.85 },
  previewText: { color: colors.ink, fontWeight: '800' },
  goesNames: { color: colors.ink, fontWeight: '800' },
  ownBox: { flexDirection: 'row', gap: 8, width: '100%' },
  ownInput: { flex: 1, paddingVertical: 8 },
  ownAdd: { backgroundColor: colors.ink, ...border, paddingHorizontal: 14, justifyContent: 'center' },
  ownAddText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  dayChip: { backgroundColor: colors.card, ...border, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  dayChipOn: { backgroundColor: colors.butter, ...shadow.select },
  dayChipText: { fontSize: 15, fontWeight: '600' },
  dayChipSub: { fontSize: 12, color: colors.muted },
  mine: { backgroundColor: colors.cream, ...border, ...shadow.card },
  mineHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  mineBody: { gap: 10, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1.5, borderTopColor: colors.ink },
  status: { borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 8, paddingVertical: 2 },
  statusIn: { backgroundColor: colors.butter, ...shadow.select },
  statusLocked: { backgroundColor: colors.ink, ...shadow.select },
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
