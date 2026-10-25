import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { activityTitle, fetchFriendsBeacons, fmtRange, fmtTime, loadHidden } from '@/lib/beacon';
import { IncomingBeacon, type FriendBeacon } from '@/lib/incoming';
import { border, colors, ScrollScreen, shadow, Text } from '@/lib/ui';

// Every friend with a lit beacon, hidden ones included. Tap one to open it.
export default function LitNow() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [beacons, setBeacons] = useState<FriendBeacon[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [b, h] = await Promise.all([fetchFriendsBeacons(userId), loadHidden()]);
    b.sort((x, y) => new Date(x.end_time).getTime() - new Date(y.end_time).getTime());
    setBeacons(b);
    setHidden(h);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selected = beacons?.find((b) => b.id === open);

  if (selected) {
    return (
      <ScrollScreen>
        <View style={styles.top}>
          <Wordmark />
          <Pressable onPress={() => setOpen(null)} hitSlop={12}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
        </View>
        <IncomingBeacon
          beacon={selected}
          meIn={selected.responses.some((r) => r.user_id === userId)}
          hidden={hidden.includes(selected.id)}
          onDone={load}
        />
      </ScrollScreen>
    );
  }

  const n = beacons?.length ?? 0;

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Wordmark />
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.h1}>Lit now</Text>
      {beacons === null ? null : n === 0 ? (
        <Text style={styles.muted}>Nobody&apos;s lit right now.</Text>
      ) : (
        <>
          <Text style={styles.muted}>
            {n === 1 ? '1 friend is free.' : `${n} friends are free.`} Soonest ending first.
          </Text>
          <View style={styles.list}>
            {beacons.map((b, i) => {
              const isHidden = hidden.includes(b.id);
              const name = b.owner?.full_name ?? 'A friend';
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setOpen(b.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${name}'s beacon`}
                  style={[styles.row, i > 0 && styles.rowLine]}>
                  <View style={[styles.avatar, isHidden && styles.faded]}>
                    <Text style={styles.avatarText}>{name[0]}</Text>
                    <View style={styles.litDot} />
                  </View>
                  <View style={[styles.grow, isHidden && styles.faded]}>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.small}>
                      {activityTitle(b.activities)} · {fmtRange(new Date(b.start_time), new Date(b.end_time))}
                    </Text>
                    {isHidden && <Text style={styles.tag}>Hidden</Text>}
                  </View>
                  <Text style={styles.ends}>Ends {fmtTime(new Date(b.end_time))} ›</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.mutedSmall}>
            Hidden beacons stay off your home screen but still show here. Beacons go out on their own at their end time.
          </Text>
        </>
      )}
    </ScrollScreen>
  );
}

function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.dot} />
      <Text style={styles.wordmarkText}>beacon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmarkText: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  list: { backgroundColor: colors.card, ...border, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  rowLine: { borderTopWidth: 2, borderTopColor: colors.ink },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  litDot: { position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.ink },
  faded: { opacity: 0.45 },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '800' },
  small: { fontSize: 13 },
  tag: { alignSelf: 'flex-start', color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  ends: { fontSize: 13, fontWeight: '600' },
});
