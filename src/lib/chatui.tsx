import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { callNumber, openSms } from './beacon';
import type { Thread, ThreadInfo } from './chat';
import { placeName } from './placeui';
import { Sheet } from './sheet';
import { border, colors, shadow, Text } from './ui';
import { eventLine, newCount } from './words';

/** "Kat: Trip it is", "You: see you there", "Kat's in". */
export function lastLine(info: ThreadInfo | undefined): string {
  if (!info?.lastBody) return 'Nothing yet. Say hi.';
  const who = info.lastMine ? 'You' : info.lastFrom ?? 'Someone';
  if (info.lastKind === 'event') {
    const m = info.lastMeta;
    const place = m && (m.label || m.place_id) ? placeName({ position: 0, starred: false, place_id: m.place_id ?? null, label: m.label ?? null }) : undefined;
    return eventLine(info.lastBody, who, m, place) || 'Nothing yet. Say hi.';
  }
  return `${who}: ${info.lastBody}`;
}

export function chatHref(t: Thread, title: string) {
  const q = t.beaconId ? `beacon=${t.beaconId}` : `poll=${t.pollId}`;
  return `/chat?${q}&title=${encodeURIComponent(title)}`;
}

/** The chat row on a plan: last message and a "2 new" count. Opens the thread. */
export function ChatRow({ thread, title, info }: { thread: Thread; title: string; info?: ThreadInfo }) {
  const n = newCount(info?.unread ?? 0);
  return (
    <Pressable
      onPress={() => router.push(chatHref(thread, title) as never)}
      accessibilityRole="button"
      accessibilityLabel={`Chat${n ? `, ${n}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="forum-outline" size={22} color={colors.ink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.last} numberOfLines={1}>
          {lastLine(info)}
        </Text>
      </View>
      {n ? <Text style={styles.badge}>{n}</Text> : null}
    </Pressable>
  );
}

/** A small coral "2 new" next to a plan's title when it's folded. */
export function NewBadge({ info }: { info?: ThreadInfo }) {
  const n = newCount(info?.unread ?? 0);
  return n ? (
    <Text style={styles.badgeSmall} numberOfLines={1}>
      {n}
    </Text>
  ) : null;
}

/**
 * Someone on a plan (31 Oct): the chat is the only speech bubble, so each person has just a Call icon.
 * Tapping their name offers "Message Kat in your own app" for a private word.
 */
export function PlanPerson({ name, phone }: { name: string; phone: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.person}>
      <Pressable
        onPress={() => phone && setOpen(true)}
        style={styles.personTap}
        accessibilityRole="button"
        accessibilityLabel={phone ? `${name}. Message or call` : name}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name[0]}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
      {phone ? (
        <Pressable
          onPress={() => callNumber(phone)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${name}`}
          hitSlop={6}
          style={({ pressed }) => [styles.call, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="phone" size={18} color={colors.ink} />
        </Pressable>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} fit>
        <View style={{ gap: 10, paddingBottom: 8 }}>
          <Text style={styles.h2}>{name}</Text>
          <Text style={styles.last}>For a word just with {name}, outside the plan&apos;s chat.</Text>
          <Pressable
            onPress={() => {
              setOpen(false);
              if (phone) openSms(phone);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.ink} />
            <Text style={styles.pickText}>Message {name} in your own app</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setOpen(false);
              if (phone) callNumber(phone);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.pick, { backgroundColor: colors.butter }, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="phone" size={20} color={colors.ink} />
            <Text style={styles.pickText}>Call {name}</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, ...border, ...shadow.select, paddingVertical: 10, paddingHorizontal: 12 },
  pressed: { boxShadow: 'none', transform: [{ translateX: 3 }, { translateY: 3 }] },
  title: { fontSize: 16, fontWeight: '800' },
  last: { fontSize: 13, color: colors.muted },
  badge: { fontSize: 12, fontWeight: '800', backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  badgeSmall: { flexShrink: 0, fontSize: 11, fontWeight: '800', backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 10, paddingHorizontal: 6, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.card, ...border },
  personTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar: { width: 32, height: 32, backgroundColor: colors.card, ...border, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  call: { width: 34, height: 34, borderRadius: 9, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.butter, alignItems: 'center', justifyContent: 'center', boxShadow: `2px 2px 0px ${colors.ink}` },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, ...border, ...shadow.select, paddingVertical: 12, paddingHorizontal: 12 },
  pickText: { fontSize: 16, fontWeight: '800' },
});
