import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from './auth';
import { activityPhrase, type BeaconSummary, fetchFriendsBeacons, fetchLockedInWith, fetchSummary, type LockedPerson, namesList, whenLabel } from './beacon';
import type { DraftPlace } from './places';
import { PlaceRow, PrefPicker, usePlaceNames, WherePicker } from './placeui';
import { ReplyIcons } from './reply';
import { WhenTag } from './when';
import { supabase } from './supabase';
import { border, Button, colors, ErrorText, shadow, Text } from './ui';

export type FriendBeacon = Awaited<ReturnType<typeof fetchFriendsBeacons>>[number];

// A friend's beacon, as a card. Used on home and on the Lit now screen.
export function IncomingBeacon({
  beacon,
  meIn,
  onDone,
  onHide,
  onDismiss,
  hidden,
}: {
  beacon: FriendBeacon;
  meIn: boolean;
  onDone: () => void;
  onHide?: () => void;
  /** Home only: clears an answered beacon off home (it stays in Lit now). */
  onDismiss?: () => void;
  hidden?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = beacon.owner?.full_name ?? 'A friend';
  const start = new Date(beacon.start_time);
  const end = new Date(beacon.end_time);
  const when = whenLabel(start, end);
  const places = [...(beacon.beacon_places ?? [])].sort((a, b) => a.position - b.position);
  usePlaceNames(places);
  const myPref = beacon.place_prefs?.[0]?.position; // undefined = not chosen yet; null = any

  const phone = beacon.owner?.phone_number ?? null;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const mine = places.find((p) => p.suggested_by === userId);

  // "Sent to 6 · Charlotte and Kat are in" (decision 63): a count and first names, never who it went to.
  const [summary, setSummary] = useState<BeaconSummary | null>(null);
  const inCount = beacon.responses.length;
  useEffect(() => {
    fetchSummary(beacon.id).then(setSummary);
  }, [beacon.id, inCount]);
  const locked = !!beacon.locked_at && meIn;
  const [people, setPeople] = useState<LockedPerson[]>([]);
  useEffect(() => {
    if (locked) fetchLockedInWith(beacon.id).then(setPeople);
  }, [locked, beacon.id]);
  // people[0] is the owner (see locked_in_with); the rest are the others who are in.
  const others = people.slice(1).map((p) => p.full_name);

  async function imIn() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('im_in', { p_beacon_id: beacon.id });
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.name}>
          {name}&apos;s up for {activityPhrase(beacon.activities)}
        </Text>
        <WhenTag text={when.text} live={when.live} />
      </View>
      {summary && (
        <Text style={styles.small}>
          Sent to {summary.sent} · {summary.in.length ? `${namesList(summary.in)} ${summary.in.length === 1 ? 'is' : 'are'} in` : 'nobody in yet'}
        </Text>
      )}
      {places.map((p) => (
        <PlaceRow key={p.position} place={p} tag={p.suggested_by ? (p.suggested_by === userId ? 'Your idea' : 'Suggested') : p.starred ? 'Their pick' : undefined} />
      ))}
      {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
      <ErrorText>{error}</ErrorText>
      {locked ? (
        <>
          <View style={styles.actions}>
            <Text style={styles.lockedTag}>Locked in</Text>
            {onDismiss && (
              <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Done</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.in}>{others.length ? `You're in with ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}` : others[0]}.` : `It's you and ${name}.`}</Text>
          {places.length > 0 && <PrefPicker beaconId={beacon.id} places={places} mine={myPref} onSaved={onDone} />}
          <SuggestPlace beaconId={beacon.id} userId={userId} mine={!!mine} onSaved={onDone} />
          <CantMakeIt beaconId={beacon.id} name={name} onDone={onDone} />
          <Text style={styles.small}>Who&apos;s in</Text>
          {people.map((p) => (
            <View key={p.id} style={styles.person}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.full_name[0]}</Text>
              </View>
              <Text style={[styles.in, { flex: 1 }]} numberOfLines={1}>
                {p.full_name}
              </Text>
              {p.phone_number ? <ReplyIcons name={p.full_name} phone={p.phone_number} compact /> : null}
            </View>
          ))}
        </>
      ) : meIn ? (
        <>
          <View style={styles.actions}>
            <Text style={styles.in}>You&apos;re in. {name} knows.</Text>
            {onDismiss && (
              <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Done</Text>
              </Pressable>
            )}
          </View>
          {places.length > 0 && <PrefPicker beaconId={beacon.id} places={places} mine={myPref} onSaved={onDone} />}
          <SuggestPlace beaconId={beacon.id} userId={userId} mine={!!mine} onSaved={onDone} />
          <CantMakeIt beaconId={beacon.id} name={name} onDone={onDone} />
          <Text style={styles.small}>Message {name}</Text>
          <ReplyIcons name={name} phone={phone} />
        </>
      ) : (
        <View style={styles.actions}>
          <Button label="I'm in" variant="accent" compact onPress={imIn} busy={busy} />
          {hidden ? (
            <Text style={styles.tag}>Hidden from home</Text>
          ) : onHide ? (
            <Pressable onPress={onHide} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Hide ${name}'s beacon`}>
              <Text style={styles.link}>Hide</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <Text style={styles.small}>
        {locked ? 'Only the people who are in can see this. You can message your friends here.' : "Everyone it went to sees who's in, by first name. Hiding is silent."}
      </Text>
    </View>
  );
}

// Take back an "I'm in" (decision 67). Asks once so it can't be tapped by accident.
function CantMakeIt({ beaconId, name, onDone }: { beaconId: string; name: string; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!sure) {
    return (
      <Pressable onPress={() => setSure(true)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>Can&apos;t make it now</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.small}>{name} gets a buzz saying you can&apos;t make it.</Text>
      <View style={styles.actions}>
        <Button
          label="Yes, I can't make it"
          secondary
          compact
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await supabase.rpc('im_out', { p_beacon_id: beaconId });
            setBusy(false);
            setSure(false);
            onDone();
          }}
        />
        <Pressable onPress={() => setSure(false)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Keep me in</Text>
        </Pressable>
      </View>
    </View>
  );
}

// One place of your own, once you're in (decision 63). It joins the owner's places for everyone.
function SuggestPlace({ beaconId, userId, mine, onSaved }: { beaconId: string; userId: string; mine: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    const d = draft[0];
    if (!d) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('suggest_place', { p_beacon_id: beaconId, p_place_id: d.placeId ?? null, p_label: d.placeId ? null : d.label ?? d.name, p_name: d.name });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    setDraft([]);
    onSaved();
  }

  if (mine && !open) {
    return (
      <View style={styles.actions}>
        <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Change my idea</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await supabase.rpc('remove_suggestion', { p_beacon_id: beaconId });
            onSaved();
          }}
          hitSlop={8}
          accessibilityRole="button">
          <Text style={styles.link}>Take it back</Text>
        </Pressable>
      </View>
    );
  }
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>Suggest somewhere else</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <WherePicker userId={userId} value={draft} onChange={setDraft} max={1} noStar addLabel="Where would you go?" />
      <ErrorText>{error}</ErrorText>
      <View style={styles.actions}>
        {draft.length ? <Button label="Suggest it" variant="butter" compact busy={busy} onPress={send} /> : <View />}
        <Pressable
          onPress={() => {
            setOpen(false);
            setDraft([]);
          }}
          hitSlop={8}
          accessibilityRole="button">
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 14, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1 },
  till: { color: colors.muted, fontSize: 13 },
  what: { fontSize: 15, fontWeight: '600' },
  quote: { fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  tag: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  in: { fontWeight: '800', fontSize: 15 },
  small: { color: colors.muted, fontSize: 12 },
  lockedTag: { fontSize: 12, fontWeight: '800', backgroundColor: colors.ink, color: colors.butter, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, ...border },
  avatar: { width: 32, height: 32, backgroundColor: colors.card, ...border, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
