import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { activityPhrase, activityTitle, fetchFriendsBeacons, fmtRange, openWhatsApp } from './beacon';
import { supabase } from './supabase';
import { Button, colors, ErrorText } from './ui';

export type FriendBeacon = Awaited<ReturnType<typeof fetchFriendsBeacons>>[number];

// A friend's beacon, as a card. Used on home and on the Lit now screen.
export function IncomingBeacon({
  beacon,
  meIn,
  onDone,
  onHide,
  hidden,
}: {
  beacon: FriendBeacon;
  meIn: boolean;
  onDone: () => void;
  onHide?: () => void;
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
    openWhatsApp(inText, phone);
  }

  return (
    <View style={styles.incoming}>
      <View style={styles.incomingHead}>
        <Text style={styles.incomingTitle}>{name}&apos;s free.</Text>
        {hidden ? (
          <Text style={styles.tag}>Hidden from home</Text>
        ) : onHide ? (
          <Pressable onPress={onHide} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Hide ${name}'s beacon`}>
            <Text style={styles.link}>Hide</Text>
          </Pressable>
        ) : null}
      </View>
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
        <Button label="I'm in" onPress={imIn} busy={busy} />
      )}
      <Text style={styles.mutedSmall}>Only {name} sees who&apos;s in. Hiding is silent.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  incoming: { backgroundColor: colors.card, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.accent },
  incomingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  incomingTitle: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  link: { color: colors.muted, fontSize: 15 },
  tag: { color: colors.muted, fontSize: 12, borderWidth: 1, borderColor: '#2C3340', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  quote: { color: colors.text, fontSize: 15, fontStyle: 'italic' },
  in: { color: colors.whatsapp, fontWeight: '700', fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
});
