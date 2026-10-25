import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import {
  ACTIVITIES,
  activityPhrase,
  activityTitle,
  fetchCircles,
  fetchFriends,
  fetchFriendsBeacons,
  fetchMyBeacon,
  fmtRange,
  fmtTime,
  halfHourSlots,
  loadAudience,
  openWhatsApp,
  presetWindows,
  saveAudience,
  type Circle,
  type Friend,
} from '@/lib/beacon';
import { BeaconGlow } from '@/lib/glow';
import { enableMatchAlerts } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { Body, Button, Card, Chip, Chips, colors, ErrorText, Label } from '@/lib/ui';

type MyBeacon = Awaited<ReturnType<typeof fetchMyBeacon>>;
type FriendBeacon = Awaited<ReturnType<typeof fetchFriendsBeacons>>[number];

export default function Home() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [mine, setMine] = useState<MyBeacon>(null);
  const [incoming, setIncoming] = useState<FriendBeacon[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [m, inc, f, c] = await Promise.all([fetchMyBeacon(userId), fetchFriendsBeacons(userId), fetchFriends(), fetchCircles()]);
    setMine(m);
    setIncoming(inc);
    setFriends(f);
    setCircles(c);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load])
  );

  useEffect(() => {
    const a = AppState.addEventListener('change', (s) => s === 'active' && load());
    const n = Notifications.addNotificationReceivedListener(() => load());
    const r = Notifications.addNotificationResponseReceivedListener(() => load());
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

  const visibleIncoming = incoming.filter((b) => !hidden.includes(b.id));
  const showComposer = !mine || composing;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}>
        <View style={styles.top}>
          <View style={styles.wordmark}>
            <View style={[styles.dot, !mine && styles.dotOff]} />
            <Text style={styles.wordmarkText}>Beacon</Text>
          </View>
          <Pressable onPress={() => router.push('/friends')} hitSlop={12}>
            <Text style={styles.link}>Friends ({friends.length})</Text>
          </Pressable>
        </View>

        {visibleIncoming.map((b) => (
          <IncomingBeacon
            key={b.id}
            beacon={b}
            meIn={b.responses.some((r) => r.user_id === userId)}
            onDone={load}
            onHide={() => setHidden((h) => [...h, b.id])}
          />
        ))}

        {showComposer ? (
          <Composer
            userId={userId}
            friends={friends}
            circles={circles}
            replacing={!!mine}
            onCancel={mine ? () => setComposing(false) : undefined}
            onLit={async () => {
              setComposing(false);
              await load();
            }}
          />
        ) : (
          mine && <LitBeacon beacon={mine} onChange={() => setComposing(true)} onOut={load} />
        )}
      </ScrollView>
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
}: {
  userId: string;
  friends: Friend[];
  circles: Circle[];
  replacing: boolean;
  onCancel?: () => void;
  onLit: () => void;
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
      <Text style={styles.h1}>{replacing ? 'Change your beacon' : 'Free for something?'}</Text>

      <View style={styles.group}>
        <Label>WHAT · PICK ANY</Label>
        <Chips>
          {ACTIVITIES.map((a) => (
            <Chip key={a} label={a} on={acts.includes(a)} onPress={() => toggleAct(a)} />
          ))}
        </Chips>
      </View>

      <View style={styles.group}>
        <Label>WHEN · TODAY</Label>
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
          WHO · {recipientCount} {recipientCount === 1 ? 'FRIEND' : 'FRIENDS'}
        </Label>
        <Chips>
          <Chip label="Everyone" on={audience.includes('everyone')} onPress={() => toggleAudience('everyone')} />
          {circles.map((c) => (
            <Chip key={c.id} label={c.name} on={audience.includes(c.id)} onPress={() => toggleAudience(c.id)} />
          ))}
        </Chips>
      </View>

      <View style={styles.group}>
        <Label>NOTE · OPTIONAL</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
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

function LitBeacon({ beacon, onChange, onOut }: { beacon: NonNullable<MyBeacon>; onChange: () => void; onOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const start = new Date(beacon.start_time);
  const end = new Date(beacon.end_time);
  const responders = beacon.responses.map((r) => r.profiles).filter(Boolean) as { full_name: string; phone_number: string | null }[];
  const replyText = `Saw you're in! ${fmtRange(start, end)} works for me. Where do you fancy?`;

  return (
    <View style={{ gap: 18 }}>
      <Text style={styles.h1}>Your beacon is lit.</Text>
      <BeaconGlow />
      <Card>
        <Text style={styles.cardTitle}>
          {activityTitle(beacon.activities)} · {fmtRange(start, end)}
        </Text>
        {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
        <Text style={styles.muted}>Goes out on its own at {fmtTime(end)}.</Text>
      </Card>

      <View style={styles.group}>
        <Label>WHO&apos;S IN</Label>
        {responders.length ? (
          <>
            {responders.map((p) => (
              <View key={p.full_name + p.phone_number} style={styles.person}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.full_name[0]}</Text>
                </View>
                <Text style={[styles.body, { flex: 1 }]}>{p.full_name}</Text>
                <Pressable style={styles.waPill} onPress={() => openWhatsApp(replyText, p.phone_number)} accessibilityRole="button">
                  <Text style={styles.waPillText}>Message</Text>
                </Pressable>
              </View>
            ))}
            <Button label="Other chat or group" secondary onPress={() => openWhatsApp(replyText)} />
          </>
        ) : (
          <Body muted>Nobody yet. You&apos;ll get a notification when someone taps &quot;I&apos;m in&quot;.</Body>
        )}
      </View>

      <Button label="Change" secondary onPress={onChange} />
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
  );
}

// A friend's beacon -----------------------------------------------------------------

function IncomingBeacon({
  beacon,
  meIn,
  onDone,
  onHide,
}: {
  beacon: FriendBeacon;
  meIn: boolean;
  onDone: () => void;
  onHide: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = beacon.owner?.full_name ?? 'A friend';
  const start = new Date(beacon.start_time);
  const end = new Date(beacon.end_time);

  const phone = beacon.owner?.phone_number ?? null;
  const inText = `I'm in for ${activityPhrase(beacon.activities)}! ${fmtRange(start, end)} works. Where are we going?`;

  async function imIn() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('im_in', { p_beacon_id: beacon.id });
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
    openWhatsApp(inText, phone);
  }

  return (
    <View style={styles.incoming}>
      <Text style={styles.incomingTitle}>{name}&apos;s free.</Text>
      <Text style={styles.cardTitle}>
        {activityTitle(beacon.activities)} · {fmtRange(start, end)}
      </Text>
      {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
      <ErrorText>{error}</ErrorText>
      {meIn ? (
        <>
          <Text style={styles.in}>You&apos;re in. {name} knows.</Text>
          <Button label={`Message ${name}`} whatsapp onPress={() => openWhatsApp(inText, phone)} />
          <Button label="Other chat or group" secondary onPress={() => openWhatsApp(inText)} />
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="I'm in" onPress={imIn} busy={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Not this time" secondary onPress={onHide} />
          </View>
        </View>
      )}
      <Text style={styles.mutedSmall}>Only {name} sees who&apos;s in.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 22, gap: 22, paddingBottom: 48 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmarkText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  dotOff: { backgroundColor: '#222833' },
  link: { color: colors.muted, fontSize: 15 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800' },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text, fontSize: 16 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  quote: { color: colors.text, fontSize: 15, fontStyle: 'italic' },
  waPill: { backgroundColor: colors.whatsapp, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  waPillText: { color: '#06260F', fontWeight: '700', fontSize: 14 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222833', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '700' },
  in: { color: colors.whatsapp, fontWeight: '700', fontSize: 14 },
  incoming: { backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.accent },
  incomingTitle: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
