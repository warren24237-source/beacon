import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { cachedPlace, loadPlaces, newSession, openInMaps, placeInfo, searchPlaces, usePlacesVersion, type BeaconPlace, type DraftPlace, type FoundPlace } from './places';
import { supabase } from './supabase';
import { border, colors, shadow, Text, TextInput } from './ui';

// Places on screen (decision 58): place rows on cards, the "Where" box when lighting,
// and the "Which suits you?" picker for friends who are in.

const Pin = ({ size = 20 }: { size?: number }) => <MaterialCommunityIcons name="map-marker" size={size} color={colors.accent} />;
const Pen = ({ size = 18 }: { size?: number }) => <MaterialCommunityIcons name="pencil-outline" size={size} color={colors.ink} />;

/** Starts loading names for the Google places in a list (once per app session). Rows redraw themselves when they arrive. */
export function usePlaceNames(places: BeaconPlace[] | undefined) {
  const key = ((places ?? []).map((p) => p.place_id).filter(Boolean) as string[]).join(',');
  useEffect(() => {
    if (key) loadPlaces(key.split(','));
  }, [key]);
}

export function placeName(p: BeaconPlace, v = 0): string {
  return p.label ?? (p.place_id ? placeInfo(p.place_id, v)?.name ?? '' : '');
}

/** One place on a card. Real places open in Google Maps; typed ones just show. */
export function PlaceRow({ place, tag, right }: { place: BeaconPlace; tag?: string; right?: string }) {
  const v = usePlacesVersion();
  const info = place.place_id ? placeInfo(place.place_id, v) : undefined;
  const isText = !place.place_id;
  const name = isText ? place.label : info?.name;
  const inner = (
    <>
      {isText ? <Pen /> : <Pin size={22} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name ?? '…'}
          </Text>
          {tag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.area} numberOfLines={1}>
          {isText ? 'Not on Maps' : info?.area ?? ''}
        </Text>
      </View>
      {right ? <Text style={styles.right}>{right}</Text> : !isText && info ? <Text style={styles.right}>Maps ›</Text> : null}
    </>
  );
  if (isText || !info) return <View style={[styles.row, isText && styles.rowText]}>{inner}</View>;
  return (
    <Pressable onPress={() => openInMaps(info)} accessibilityRole="link" accessibilityLabel={`Open ${info.name} in Maps`} style={styles.row}>
      {inner}
    </Pressable>
  );
}

// The "Where" box in the light sheet ---------------------------------------------------

/** Your last few real places, from your own past beacons. */
async function recentPlaceIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('beacon_places')
    .select('place_id, beacons!inner(owner_id, created_at)')
    .eq('beacons.owner_id', userId)
    .not('place_id', 'is', null)
    .limit(30);
  const rows = ((data ?? []) as any[]).sort((a, b) => String(b.beacons.created_at).localeCompare(String(a.beacons.created_at)));
  return [...new Set(rows.map((r) => r.place_id as string))].slice(0, 3);
}

export function WherePicker({ userId, value, onChange, onFocus }: { userId: string; value: DraftPlace[]; onChange: (v: DraftPlace[]) => void; onFocus?: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundPlace[]>([]);
  const [recent, setRecent] = useState<FoundPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const session = useRef(newSession());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    recentPlaceIds(userId).then(async (ids) => {
      await loadPlaces(ids);
      if (live) setRecent(ids.map((id) => cachedPlace(id)).filter(Boolean) as FoundPlace[]);
    });
    return () => {
      live = false;
    };
  }, [open, userId]);

  // Search as you type, a moment after the last key (fewer calls to Google).
  const onType = (t: string) => {
    setQ(t);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 2) {
      setFound([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      const r = await searchPlaces(t.trim(), session.current);
      setBusy(false);
      setFound(r.places);
      setProblem(r.error ?? '');
    }, 300);
  };

  const used = new Set(value.map((v) => v.placeId).filter(Boolean));
  const add = (p: DraftPlace) => {
    onChange([...value, p].slice(0, 3));
    setQ('');
    setFound([]);
    setOpen(false);
    session.current = newSession();
  };
  const pickReal = async (p: FoundPlace) => {
    add({ placeId: p.id, name: p.name, area: p.area, starred: false });
    loadPlaces([p.id], session.current); // closes Google's search session and warms the name for cards
  };
  const pickTyped = () => {
    const t = q.trim();
    if (t) add({ label: t.slice(0, 40), name: t.slice(0, 40), starred: false });
  };
  // Enter: the top real place if there is one, otherwise what was typed.
  const onEnter = () => (found[0] ? pickReal(found[0]) : pickTyped());

  const list = (q.trim() ? found : recent).filter((p) => !used.has(p.id));

  return (
    <View style={{ gap: 8 }}>
      {value.map((p, i) => (
        <View key={(p.placeId ?? p.label ?? '') + i} style={[styles.picked, !p.placeId && styles.pickedText]}>
          {p.placeId ? <Pin size={22} /> : <Pen />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.area} numberOfLines={1}>
              {p.placeId ? p.area : 'Not on Maps'}
            </Text>
          </View>
          <Pressable
            onPress={() => onChange(value.map((v, j) => ({ ...v, starred: j === i ? !v.starred : false })))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={p.starred ? 'Remove my pick' : 'Make this my pick'}>
            <MaterialCommunityIcons name={p.starred ? 'star' : 'star-outline'} size={22} color={p.starred ? colors.accent : colors.muted} />
          </Pressable>
          <Pressable onPress={() => onChange(value.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove place">
            <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>
      ))}
      {value.length > 0 && (
        <Text style={styles.hint}>{value.some((v) => v.starred) ? `★ ${value.find((v) => v.starred)!.name} is your pick.` : 'No star: no preference, just options.'}</Text>
      )}

      {open ? (
        <View style={{ gap: 8 }}>
          <TextInput value={q} onChangeText={onType} onSubmitEditing={onEnter} onFocus={onFocus} placeholder="Where? e.g. The Malt Cross, Dan's" autoFocus autoCorrect={false} returnKeyType="done" maxLength={40} />
          {(list.length > 0 || q.trim()) && (
            <View style={styles.results}>
              {!q.trim() && list.length > 0 && <Text style={styles.resultsHead}>Your recent places</Text>}
              {list.map((p) => (
                <Pressable key={p.id} onPress={() => pickReal(p)} style={styles.result} accessibilityRole="button">
                  <Pin />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.area} numberOfLines={1}>
                      {p.area}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {busy && <ActivityIndicator color={colors.ink} style={{ marginVertical: 6 }} />}
              {q.trim() ? (
                <Pressable onPress={pickTyped} style={styles.result} accessibilityRole="button">
                  <Pen />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { fontWeight: '600' }]} numberOfLines={1}>
                      Use &quot;{q.trim()}&quot;
                    </Text>
                    <Text style={styles.area}>As typed, without a Maps link</Text>
                  </View>
                </Pressable>
              ) : null}
              {q.trim() && found.length > 0 ? <Text style={styles.google}>Powered by Google</Text> : null}
            </View>
          )}
          {problem ? <Text style={styles.hint}>{problem}</Text> : null}
        </View>
      ) : value.length === 0 ? (
        <Pressable onPress={() => setOpen(true)} style={styles.add} accessibilityRole="button">
          <Pin size={22} />
          <Text style={styles.addText}>Add a place</Text>
        </Pressable>
      ) : value.length < 3 ? (
        <Pressable onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.more}>+ Add another (up to 3)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// "Which suits you?" for friends who are in ----------------------------------------------

export function PrefPicker({ beaconId, places, mine, onSaved }: { beaconId: string; places: BeaconPlace[]; mine: number | null | undefined; onSaved: () => void }) {
  const v = usePlacesVersion();
  const [choice, setChoice] = useState<number | null | undefined>(mine);
  const pick = async (pos: number | null) => {
    setChoice(pos);
    await supabase.rpc('set_place_pref', { p_beacon_id: beaconId, p_position: pos });
    onSaved();
  };
  const sorted = [...places].sort((a, b) => a.position - b.position);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.hint}>Which suits you? · optional</Text>
      {sorted.map((p) => (
        <Pressable key={p.position} onPress={() => pick(p.position)} style={[styles.pref, choice === p.position && styles.prefOn]} accessibilityRole="radio" accessibilityState={{ checked: choice === p.position }}>
          {p.place_id ? <Pin /> : <Pen />}
          <Text style={styles.name} numberOfLines={1}>
            {placeName(p, v) || '…'}
          </Text>
        </Pressable>
      ))}
      <Pressable onPress={() => pick(null)} style={[styles.pref, choice === null && styles.prefOn]} accessibilityRole="radio" accessibilityState={{ checked: choice === null }}>
        <Text style={styles.name}>Any is fine</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10 },
  rowText: { backgroundColor: colors.card },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  area: { fontSize: 12, color: colors.muted },
  right: { fontSize: 12, fontWeight: '800', color: colors.muted },
  tag: { backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 5 },
  tagText: { fontSize: 11, fontWeight: '800' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.butter, ...border, ...shadow.select, paddingVertical: 8, paddingHorizontal: 10 },
  pickedText: { backgroundColor: colors.card },
  hint: { fontSize: 13, color: colors.muted },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: 4, paddingVertical: 11, paddingHorizontal: 12 },
  addText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  more: { fontSize: 14, fontWeight: '600', color: colors.muted, textDecorationLine: 'underline' },
  results: { backgroundColor: colors.card, ...border },
  resultsHead: { fontSize: 12, color: colors.muted, fontWeight: '600', paddingHorizontal: 12, paddingTop: 8 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1.5, borderTopColor: colors.skyDeep },
  google: { fontSize: 11, color: colors.muted, textAlign: 'right', paddingHorizontal: 10, paddingBottom: 6 },
  pref: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, ...border, paddingVertical: 9, paddingHorizontal: 10 },
  prefOn: { backgroundColor: colors.butter, ...shadow.select },
});
