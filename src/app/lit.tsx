import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { activityTitle, fetchFriendsBeacons, fmtRange, fmtTime, loadHidden } from '@/lib/beacon';
import { IncomingBeacon, type FriendBeacon } from '@/lib/incoming';
import { colors, ScrollScreen } from '@/lib/ui';

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
          <View>
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
      <Text style={styles.wordmarkText}>Beacon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmarkText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#222833' },
  link: { color: colors.muted, fontSize: 15 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: '#2C3340' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#222833', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '700' },
  litDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  faded: { opacity: 0.5 },
  grow: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  small: { color: colors.text, fontSize: 13 },
  tag: {
    alignSelf: 'flex-start',
    color: colors.muted,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#2C3340',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    marginTop: 3,
  },
  ends: { color: colors.muted, fontSize: 13 },
});
