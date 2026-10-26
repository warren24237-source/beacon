import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { activityTitle, fetchFriendsBeacons, fmtRange, loadHidden } from '@/lib/beacon';
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
    const rank = (x: FriendBeacon) => (x.responses.some((r) => r.user_id === userId) ? 1 : h.includes(x.id) ? 2 : 0);
    b.sort((x, y) => rank(x) - rank(y) || new Date(x.end_time).getTime() - new Date(y.end_time).getTime());
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
            {n === 1 ? '1 friend is free.' : `${n} friends are free.`} Only you see these tags.
          </Text>
          <View style={styles.list}>
            {beacons.map((b, i) => {
              const meIn = b.responses.some((r) => r.user_id === userId);
              const isHidden = !meIn && hidden.includes(b.id);
              const tag = meIn ? "You're in" : isHidden ? 'Hidden' : 'Waiting on you';
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
                  </View>
                  <Text style={[styles.tag, meIn ? styles.tagIn : isHidden ? styles.tagHidden : styles.tagNew]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.mutedSmall}>
            Once you answer or hide a beacon it leaves home but stays here. Beacons go out on their own at their end time.
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
  tag: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  tagNew: { backgroundColor: colors.accent },
  tagIn: { backgroundColor: colors.butter },
  tagHidden: { backgroundColor: colors.card, borderStyle: 'dashed', color: colors.muted, fontWeight: '600' },
});
