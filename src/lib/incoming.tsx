import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { activityPhrase, activityTitle, fetchFriendsBeacons, fmtRange, fmtTime } from './beacon';
import { ReplyIcons } from './reply';
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

  const phone = beacon.owner?.phone_number ?? null;
  const inText = `I'm in for ${activityPhrase(beacon.activities)}! ${fmtRange(start, end)} works. Where are we going?`;

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
        <Text style={styles.name}>{name}&apos;s free</Text>
        <Text style={styles.till}>till {fmtTime(end)}</Text>
      </View>
      <Text style={styles.what}>
        {activityTitle(beacon.activities)} · {fmtRange(start, end)}
      </Text>
      {beacon.note ? <Text style={styles.quote}>“{beacon.note}”</Text> : null}
      <ErrorText>{error}</ErrorText>
      {meIn ? (
        <>
          <View style={styles.actions}>
            <Text style={styles.in}>You&apos;re in. {name} knows.</Text>
            {onDismiss && (
              <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button">
                <Text style={styles.link}>Done</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.small}>Message {name}</Text>
          <ReplyIcons name={name} phone={phone} text={inText} />
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
      <Text style={styles.small}>Only {name} sees who&apos;s in. Hiding is silent.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 14, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1 },
  till: { color: colors.muted, fontSize: 13 },
  what: { fontSize: 15, fontWeight: '600' },
  quote: { fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  tag: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  in: { fontWeight: '800', fontSize: 15 },
  small: { color: colors.muted, fontSize: 12 },
});
