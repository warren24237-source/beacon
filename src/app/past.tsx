import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { setTemplate, type PlanTemplate } from '@/lib/again';
import { fmtRange } from '@/lib/beacon';
import { chatHref } from '@/lib/chatui';
import { placeName, usePlaceNames } from '@/lib/placeui';
import { usePlacesVersion, type BeaconPlace } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import { BackBar, border, Button, colors, ScrollScreen, shadow, Text } from '@/lib/ui';
import { joinNames, shortDay } from '@/lib/words';

// Past plans (31 Oct, prototype design/prototypes/home-and-history.html): ended beacons someone was in on,
// and ended Find a days, that you were part of. Last 6 months, newest first. Chat stays readable 7 days.

type Past = {
  kind: 'beacon' | 'poll';
  id: string;
  title: string;
  activities: string[] | null;
  mine: boolean;
  owner: string;
  start_time: string | null;
  end_time: string | null;
  day: string | null;
  time_label: string | null;
  status: 'locked' | 'called_off' | 'ended';
  place: { place_id: string | null; label: string | null } | null;
  places: { place_id: string | null; label: string | null; starred: boolean }[] | null;
  audience_all: boolean | null;
  audience_circle_ids: string[] | null;
  who: string[];
  ended: string;
  chat_open: boolean;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const asPlace = (p: { place_id: string | null; label: string | null }): BeaconPlace => ({ position: 0, starred: false, place_id: p.place_id, label: p.label });

function whenOf(p: Past) {
  if (p.kind === 'poll') return `${p.day ? shortDay(p.day) : ''}${p.time_label ? ` · ${p.time_label}` : ''}`;
  const s = new Date(p.start_time!);
  return `${shortDay(`${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`)} · ${fmtRange(s, new Date(p.end_time!))}`;
}
const tagOf = (p: Past) => (p.status === 'called_off' ? 'Called off' : p.status === 'locked' ? 'Locked in' : p.kind === 'poll' ? 'Find a day' : 'Went ahead');

export default function PastPlans() {
  const [plans, setPlans] = useState<Past[] | null>(null);
  const [open, setOpen] = useState<Past | null>(null);
  const v = usePlacesVersion();

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('past_plans').then(({ data }) => setPlans((data as Past[] | null) ?? []));
    }, [])
  );
  usePlaceNames((plans ?? []).filter((p) => p.place?.place_id).map((p) => asPlace(p.place!)));

  if (open) {
    const where = open.place ? placeName(asPlace(open.place), v) : '';
    return (
      <ScrollScreen>
        <BackBar title={open.title} sub={tagOf(open)} onBack={() => setOpen(null)} />
        <View style={styles.card}>
          <Row k={open.kind === 'poll' ? 'Asked by' : 'Lit by'} v={open.mine ? 'You' : open.owner} />
          <Row k="When" v={whenOf(open)} />
          {open.kind === 'beacon' && <Row k="Where" v={where || 'Not set'} />}
          <Row k={open.kind === 'poll' ? 'Asked' : 'Who'} v={open.who.length ? joinNames(open.who) : 'Just you'} />
        </View>
        {open.chat_open ? (
          <Button
            label="Read the chat"
            secondary
            onPress={() => router.push(chatHref(open.kind === 'beacon' ? { beaconId: open.id } : { pollId: open.id }, open.title) as never)}
          />
        ) : (
          <Text style={styles.muted}>The chat for this one has gone. Chats go 7 days after a plan ends.</Text>
        )}
        {open.kind === 'beacon' && open.mine && (
          <>
            <Button
              label="Do this again"
              onPress={() => {
                const t: PlanTemplate = {
                  activities: open.activities ?? [],
                  places: open.places ?? [],
                  audience_all: !!open.audience_all,
                  audience_circle_ids: open.audience_circle_ids ?? [],
                };
                setTemplate(t);
                router.dismissTo('/');
              }}
            />
            <Text style={styles.muted}>Opens the lamp with the same what, places and who. You pick a new time.</Text>
          </>
        )}
      </ScrollScreen>
    );
  }

  // Grouped by month, newest first.
  const groups: { label: string; items: Past[] }[] = [];
  for (const p of plans ?? []) {
    const d = new Date(p.ended);
    const label = MONTHS[d.getMonth()];
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(p);
  }

  return (
    <ScrollScreen>
      <BackBar title="Past plans" sub="Plans you were part of, last 6 months" />
      {plans && !plans.length && <Text style={styles.muted}>Nothing yet. Plans show here once they&apos;ve happened.</Text>}
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <Text style={styles.month}>{g.label.toUpperCase()}</Text>
          {g.items.map((p) => {
            const where = p.place ? placeName(asPlace(p.place), v) : '';
            return (
              <Pressable
                key={p.kind + p.id}
                onPress={() => setOpen(p)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {p.title}
                    {!p.mine && <Text style={styles.owner}> · {p.owner}&apos;s</Text>}
                  </Text>
                  <Text style={styles.muted} numberOfLines={2}>
                    {whenOf(p)}
                    {where ? ` · ${where}` : p.who.length ? ` · with ${joinNames(p.who)}` : ''}
                  </Text>
                </View>
                <Text style={[styles.tag, p.status === 'locked' && styles.tagLocked, p.status === 'called_off' && styles.tagOff]}>{tagOf(p)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollScreen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14 },
  month: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: colors.muted, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, ...border, ...shadow.select, paddingVertical: 11, paddingHorizontal: 12 },
  pressed: { boxShadow: 'none', transform: [{ translateX: 3 }, { translateY: 3 }] },
  title: { fontSize: 17, fontWeight: '800' },
  owner: { fontSize: 15, fontWeight: '600', color: colors.muted },
  tag: { fontSize: 12, fontWeight: '800', borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.bg, overflow: 'hidden' },
  tagLocked: { backgroundColor: colors.ink, color: colors.butter },
  tagOff: { backgroundColor: colors.skyDeep },
  card: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 14, gap: 10 },
  kv: { flexDirection: 'row', gap: 12 },
  k: { width: 72, color: colors.muted, fontSize: 13, fontWeight: '600', paddingTop: 2 },
  v: { flex: 1, fontSize: 16 },
});
