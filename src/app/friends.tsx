import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { fetchCircles, fetchFriends, type Circle, type Friend } from '@/lib/beacon';
import { cachedContacts, contactsStatus, loadPhoneContacts, type PhoneContact } from '@/lib/contacts';
import { inviteText } from '@/lib/invite';
import { normaliseNumber } from '@/lib/phone';
import { Sheet } from '@/lib/sheet';
import { supabase } from '@/lib/supabase';
import { border, Button, Chip, Chips, colors, ErrorText, Label, ScrollScreen, shadow, Text, TextInput } from '@/lib/ui';

// Friends (decisions 46 to 49): requests waiting on you, one "Add a friend", your circles, your friends.

type Request = { from_id: string; full_name: string };

const KNOWN_KEY = 'beacon:knownFriends';
async function loadKnown(): Promise<string[] | null> {
  try {
    const v = await AsyncStorage.getItem(KNOWN_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
async function saveKnown(ids: string[]) {
  try {
    await AsyncStorage.setItem(KNOWN_KEY, JSON.stringify(ids));
  } catch {}
}

export default function Friends() {
  const { profile, session } = useAuth();
  const userId = session?.user.id ?? '';
  const myCode = profile?.friend_code ?? null;

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [adding, setAdding] = useState(false);
  const [prompt, setPrompt] = useState<Friend | null>(null);
  const [circleId, setCircleId] = useState<string | null>(null); // a circle's id, or 'new'
  const [draft, setDraft] = useState<string[]>([]);
  const [friendId, setFriendId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, c, r] = await Promise.all([fetchFriends(), fetchCircles(), supabase.rpc('incoming_friend_requests')]);
    setFriends(f);
    setCircles(c);
    setRequests((r.data ?? []) as Request[]);
    return f;
  }, []);

  // Someone accepted your request since you last looked: ask once which circles they go in (decision 48).
  const checkNew = useCallback(async (f: Friend[]) => {
    const known = await loadKnown();
    const ids = f.map((x) => x.id);
    if (known) {
      const fresh = f.find((x) => !known.includes(x.id));
      if (fresh) setPrompt(fresh);
    }
    saveKnown(ids);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().then(checkNew);
    }, [load, checkNew])
  );

  async function respond(r: Request, accept: boolean) {
    await supabase.rpc('respond_friend_request', { p_from: r.from_id, p_accept: accept });
    const f = await load();
    if (accept) {
      const known = (await loadKnown()) ?? [];
      saveKnown([...new Set([...known, ...f.map((x) => x.id)])]);
      setPrompt({ id: r.from_id, full_name: r.full_name });
    }
  }

  async function toggle(circle: Circle, id: string) {
    const isIn = circle.member_ids.includes(id);
    setCircles((cs) => cs.map((c) => (c.id === circle.id ? { ...c, member_ids: isIn ? c.member_ids.filter((m) => m !== id) : [...c.member_ids, id] } : c)));
    if (isIn) await supabase.from('circle_members').delete().eq('circle_id', circle.id).eq('member_id', id);
    else await supabase.from('circle_members').insert({ circle_id: circle.id, member_id: id });
  }

  function openNewCircle(withFriend?: string) {
    setDraft(withFriend ? [withFriend] : []);
    setPrompt(null);
    setFriendId(null);
    setCircleId('new');
  }

  const friend = friends?.find((f) => f.id === friendId) ?? null;

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Text style={styles.h1}>Friends</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      {requests.length > 0 && (
        <View style={styles.group}>
          <Label>Waiting on you</Label>
          <View style={styles.list}>
            {requests.map((r, i) => (
              <View key={r.from_id} style={[styles.row, styles.reqRow, i > 0 && styles.rowLine]}>
                <Avatar name={r.full_name} />
                <View style={styles.grow}>
                  <Text style={styles.name}>{r.full_name}</Text>
                  <Text style={styles.sub}>Wants to add you</Text>
                </View>
                <SmallButton label="Accept" onPress={() => respond(r, true)} />
                <Pressable onPress={() => respond(r, false)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>Decline</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {friends !== null && friends.length === 0 ? (
        <>
          <View style={styles.empty}>
            <Text style={styles.h2}>Get your mates on</Text>
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              Beacon only works with people on it. Find them in your contacts. If they&apos;re not on yet, invite them in one tap.
            </Text>
          </View>
          <Button label="Add a friend" onPress={() => setAdding(true)} />
        </>
      ) : (
        <>
          <Button label="Add a friend" onPress={() => setAdding(true)} />

          <View style={styles.group}>
            <Label>Your circles · only you see these</Label>
            <Chips>
              {circles.map((c) => (
                <Chip key={c.id} label={c.name} sub={String(c.member_ids.filter((m) => friends?.some((f) => f.id === m)).length)} onPress={() => setCircleId(c.id)} />
              ))}
              <NewChip onPress={() => openNewCircle()} />
            </Chips>
          </View>

          {friends && (
            <View style={styles.group}>
              <Label>
                {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
              </Label>
              <View style={styles.list}>
                {friends.map((f, i) => {
                  const inCircles = circles.filter((c) => c.member_ids.includes(f.id)).map((c) => c.name);
                  return (
                    <Pressable key={f.id} onPress={() => setFriendId(f.id)} accessibilityRole="button" style={[styles.row, i > 0 && styles.rowLine]}>
                      <Avatar name={f.full_name} />
                      <View style={styles.grow}>
                        <Text style={styles.name}>{f.full_name}</Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {inCircles.length ? inCircles.join(', ') : 'No circle'}
                        </Text>
                      </View>
                      <Text style={styles.chev}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      {friends !== null && <DeleteAccount />}

      <AddSheet visible={adding} myCode={myCode} onClose={() => setAdding(false)} onChanged={load} />

      {/* Put them in a circle? */}
      <Sheet fit visible={!!prompt} onClose={() => setPrompt(null)} footer={<Button label="Done" onPress={() => setPrompt(null)} />}>
        {prompt && (
          <View style={styles.sheetBody}>
            <Text style={styles.h2}>You and {first(prompt.full_name)} are friends</Text>
            <Text style={styles.muted}>Put {first(prompt.full_name)} in a circle?</Text>
            <Chips>
              {circles.map((c) => (
                <Chip key={c.id} label={c.name} on={c.member_ids.includes(prompt.id)} onPress={() => toggle(c, prompt.id)} />
              ))}
              <NewChip onPress={() => openNewCircle(prompt.id)} />
            </Chips>
          </View>
        )}
      </Sheet>

      <CircleSheet
        id={circleId}
        userId={userId}
        circles={circles}
        friends={friends ?? []}
        draft={draft}
        setDraft={setDraft}
        onToggle={toggle}
        onClose={() => {
          setCircleId(null);
          load();
        }}
      />

      {/* A friend: their circles, or remove them */}
      <FriendSheet friend={friend} circles={circles} onToggle={toggle} onNewCircle={() => friend && openNewCircle(friend.id)} userId={userId} onClose={() => setFriendId(null)} onRemoved={load} />
    </ScrollScreen>
  );
}

// Add a friend: your contacts, Add or Invite each (decision 47) ---------------------------

function AddSheet({ visible, myCode, onClose, onChanged }: { visible: boolean; myCode: string | null; onClose: () => void; onChanged: () => void }) {
  const [people, setPeople] = useState<PhoneContact[] | null>(null);
  const [problem, setProblem] = useState('');
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Record<string, 'requested' | 'friends'>>({});
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeOrNumber, setCodeOrNumber] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);

  // Load contacts each time the sheet opens.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPeople(cachedContacts());
      setProblem('');
      setQ('');
      setMsg('');
      setError('');
    }
  }
  // Google Play: explain why before the phone asks for contacts. Only read them once allowed.
  const [permission, setPermission] = useState<'granted' | 'ask' | 'blocked' | null>(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    contactsStatus().then((st) => {
      if (!live) return;
      setPermission(st);
      if (st !== 'granted') return;
      loadPhoneContacts().then((r) => {
        if (!live) return;
        if (r.ok) setPeople(r.people);
        else setProblem(r.reason);
      });
    });
    return () => {
      live = false;
    };
  }, [visible]);

  async function allowContacts() {
    const r = await loadPhoneContacts(); // asks the phone for permission, then reads
    if (r.ok) {
      setPermission('granted');
      setPeople(r.people);
    } else {
      setPermission(await contactsStatus());
      setProblem(r.reason);
    }
  }

  // People on Beacon sit in their own short section at the top, everyone else A to Z underneath, so "who can I add?"
  // is answered as soon as the list opens, with no toggle to find (decision 74).
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = (people ?? []).filter((p) => !t || p.name.toLowerCase().includes(t));
    return { on: all.filter((p) => p.match), off: all.filter((p) => !p.match).slice(0, 200) };
  }, [people, q]);

  async function add(p: PhoneContact) {
    if (!p.match) return;
    const { data, error } = await supabase.rpc('request_friend', { p_user_id: p.match.id });
    if (error) return setError(error.message);
    setSent((s) => ({ ...s, [p.match!.id]: data === 'friends' ? 'friends' : 'requested' }));
    if (data === 'friends') onChanged();
  }

  function invite(p: PhoneContact) {
    setInvited((s) => ({ ...s, [p.key]: true }));
    // The Share menu carries the full invite (link and codes) into any app; you pick the app, then the person.
    Share.share({ message: inviteText(myCode, first(p.name)) });
  }

  async function addCodeOrNumber() {
    setError('');
    setMsg('');
    const v = codeOrNumber.trim();
    if (!v) return setError('Type their friend code or mobile number.');
    setBusy(true);
    if (/^[a-z0-9]{6}$/i.test(v)) {
      const { data, error } = await supabase.rpc('add_friend', { p_code: v.toUpperCase() });
      setBusy(false);
      if (error) return setError(error.message);
      setMsg(`You and ${data} are now friends.`);
    } else {
      const n = normaliseNumber(v);
      if (!n) {
        setBusy(false);
        return setError("That doesn't look like a code or a number. Codes are 6 characters, e.g. 4923EA.");
      }
      const { data, error } = await supabase.rpc('request_friend_by_phone', { p_phone_number: n });
      setBusy(false);
      if (error) return setError(error.message);
      setMsg(data === 'friends' ? 'You are now friends.' : 'Request sent. They need to accept it.');
    }
    setCodeOrNumber('');
    onChanged();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetBody}>
        <Text style={styles.h2}>Add a friend</Text>
        {permission === 'granted' && <TextInput value={q} onChangeText={setQ} placeholder="Search your contacts" autoCorrect={false} />}
        <ErrorText>{error}</ErrorText>
        {permission === 'ask' ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Find your mates in your contacts</Text>
            <Text style={styles.body}>
              Beacon checks your contacts&apos; phone numbers to see who&apos;s already on Beacon, so you can add them, or invite the ones who aren&apos;t. Your contacts stay on your phone: numbers are only compared, never stored.
            </Text>
            <Button label="Allow contacts" onPress={allowContacts} />
          </View>
        ) : permission === 'blocked' ? (
          <Text style={styles.muted}>Contacts are switched off for Beacon. You can turn them on in your phone&apos;s settings, or add a mate by code or number below.</Text>
        ) : problem ? (
          <Text style={styles.muted}>{problem}</Text>
        ) : people === null ? (
          <ActivityIndicator color={colors.ink} style={{ marginVertical: 16 }} />
        ) : shown.on.length + shown.off.length === 0 ? (
          <Text style={styles.muted}>{people.length ? 'Nobody in your contacts called that.' : 'No contacts with a mobile number.'}</Text>
        ) : (
          <View style={{ gap: 14 }}>
            {[
              { key: 'on', title: 'On Beacon', list: shown.on },
              { key: 'off', title: shown.on.length ? 'Everyone else' : 'Not on Beacon yet', list: shown.off },
            ]
              .filter((sec) => sec.list.length)
              .map((sec) => (
                <View key={sec.key} style={{ gap: 6 }}>
                  <Label>{sec.title}</Label>
                  <View style={styles.list}>
                    {sec.list.map((p, i) => {
                      const m = p.match;
                      const state = m ? (sent[m.id] ?? m.status) : null;
                      return (
                        <View key={p.key} style={[styles.row, i > 0 && styles.rowLine]}>
                          <Avatar name={p.name} ghost={!m} />
                          <View style={styles.grow}>
                            <Text style={styles.name} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.sub}>{m ? 'On Beacon' : invited[p.key] ? 'Invited' : 'Not on Beacon yet'}</Text>
                          </View>
                          {state === 'friends' ? (
                            <Text style={styles.state}>Friends</Text>
                          ) : state === 'requested' ? (
                            <Text style={styles.state}>Requested</Text>
                          ) : state === 'incoming' ? (
                            <Text style={styles.state}>Wants to add you</Text>
                          ) : m ? (
                            <SmallButton label="Add" onPress={() => add(p)} />
                          ) : (
                            <SmallButton label={invited[p.key] ? 'Invite again' : 'Invite'} invite={!invited[p.key]} onPress={() => invite(p)} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
          </View>
        )}

        {codeOpen ? (
          <View style={{ gap: 10, marginTop: 6 }}>
            <Label>Their code or mobile number</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={codeOrNumber}
                onChangeText={setCodeOrNumber}
                autoCapitalize="characters"
                placeholder="e.g. 4923EA or 07700 900123"
                style={{ flex: 1 }}
                onSubmitEditing={addCodeOrNumber}
              />
              <View style={{ width: 84 }}>
                <Button label="Add" onPress={addCodeOrNumber} busy={busy} />
              </View>
            </View>
            {msg ? <Text style={styles.ok}>{msg}</Text> : null}
            <Label>Your code</Label>
            <Text style={styles.code} selectable>
              {myCode ?? '...'}
            </Text>
            <Pressable onPress={() => Share.share({ message: inviteText(myCode) })} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, styles.underline]}>Share an invite another way</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setCodeOpen(true)} hitSlop={8} accessibilityRole="button" style={{ marginTop: 4 }}>
            <Text style={[styles.link, styles.underline]}>Got a code or number instead?</Text>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}

// A circle: rename, who's in, delete (decision 48) ------------------------------------

function CircleSheet({
  id,
  userId,
  circles,
  friends,
  draft,
  setDraft,
  onToggle,
  onClose,
}: {
  id: string | null;
  userId: string;
  circles: Circle[];
  friends: Friend[];
  draft: string[];
  setDraft: (d: string[]) => void;
  onToggle: (c: Circle, friendId: string) => void;
  onClose: () => void;
}) {
  const isNew = id === 'new';
  const circle = circles.find((c) => c.id === id) ?? null;
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (id !== lastId) {
    setLastId(id);
    setName(circle?.name ?? '');
    setError('');
  }

  const clash = (n: string) => circles.some((c) => c.id !== circle?.id && c.name.trim().toLowerCase() === n.trim().toLowerCase());

  async function saveName() {
    const n = name.trim();
    if (!circle || !n || n === circle.name) return true;
    if (clash(n)) {
      setError(`You already have a circle called ${n}.`);
      return false;
    }
    await supabase.from('circles').update({ name: n }).eq('id', circle.id);
    return true;
  }

  async function close() {
    if (await saveName()) onClose();
  }

  async function create() {
    const n = name.trim();
    if (!n) return setError('Give your circle a name.');
    if (clash(n)) return setError(`You already have a circle called ${n}.`);
    setBusy(true);
    const { data, error } = await supabase.from('circles').insert({ name: n, owner_id: userId }).select('id').single();
    if (!error && data && draft.length) await supabase.from('circle_members').insert(draft.map((m) => ({ circle_id: data.id, member_id: m })));
    setBusy(false);
    if (error) return setError(error.message);
    onClose();
  }

  async function remove() {
    if (!circle) return;
    await supabase.from('circles').delete().eq('id', circle.id);
    onClose();
  }

  return (
    <Sheet visible={!!id} onClose={close} footer={isNew ? <Button label="Create circle" onPress={create} busy={busy} /> : undefined}>
      <View style={styles.sheetBody}>
        <Label>{isNew ? 'New circle' : 'Circle name'}</Label>
        <TextInput value={name} onChangeText={setName} maxLength={30} placeholder="e.g. Five-a-side" onBlur={() => !isNew && saveName()} />
        <ErrorText>{error}</ErrorText>
        <Label>Who&apos;s in · only you see this</Label>
        {friends.length === 0 ? (
          <Text style={styles.muted}>Add a friend first.</Text>
        ) : (
          <View style={styles.list}>
            {friends.map((f, i) => {
              const on = isNew ? draft.includes(f.id) : !!circle?.member_ids.includes(f.id);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => (isNew ? setDraft(on ? draft.filter((x) => x !== f.id) : [...draft, f.id]) : circle && onToggle(circle, f.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.row, i > 0 && styles.rowLine]}>
                  <View style={[styles.tick, on && styles.tickOn]}>{on ? <Text style={styles.tickMark}>✓</Text> : null}</View>
                  <Text style={[styles.name, { flex: 1 }]}>{f.full_name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {!isNew && (
          <Pressable onPress={remove} hitSlop={8} accessibilityRole="button" style={{ marginTop: 6 }}>
            <Text style={[styles.link, styles.underline]}>Delete this circle</Text>
          </Pressable>
        )}
      </View>
    </Sheet>
  );
}

// A friend: circles, or remove silently (decision 49) ----------------------------------

function FriendSheet({
  friend,
  circles,
  userId,
  onToggle,
  onNewCircle,
  onClose,
  onRemoved,
}: {
  friend: Friend | null;
  circles: Circle[];
  userId: string;
  onToggle: (c: Circle, friendId: string) => void;
  onNewCircle: () => void;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if ((friend?.id ?? null) !== lastId) {
    setLastId(friend?.id ?? null);
    setConfirm(false);
  }

  async function remove() {
    if (!friend) return;
    setBusy(true);
    await supabase.from('friendships').delete().or(`and(user_id.eq.${userId},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${userId})`);
    const mine = circles.map((c) => c.id);
    if (mine.length) await supabase.from('circle_members').delete().eq('member_id', friend.id).in('circle_id', mine);
    setBusy(false);
    onClose();
    onRemoved();
  }

  return (
    <Sheet fit visible={!!friend} onClose={onClose}>
      {friend && (
        <View style={styles.sheetBody}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={friend.full_name} big />
            <Text style={styles.h2}>{friend.full_name}</Text>
          </View>
          <Label>Circles</Label>
          <Chips>
            {circles.map((c) => (
              <Chip key={c.id} label={c.name} on={c.member_ids.includes(friend.id)} onPress={() => onToggle(c, friend.id)} />
            ))}
            <NewChip onPress={onNewCircle} />
          </Chips>
          {confirm ? (
            <View style={styles.confirm}>
              <Text style={styles.body}>
                <Text style={{ fontWeight: '800' }}>Remove {first(friend.full_name)}?</Text> They won&apos;t be told. You&apos;ll stop seeing each other&apos;s beacons.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Keep" secondary onPress={() => setConfirm(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Remove" onPress={remove} busy={busy} />
                </View>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setConfirm(true)} hitSlop={8} accessibilityRole="button" style={{ marginTop: 8 }}>
              <Text style={[styles.link, styles.underline]}>Remove from friends</Text>
            </Pressable>
          )}
        </View>
      )}
    </Sheet>
  );
}

// Delete my account (Google Play requirement) -------------------------------------------

function DeleteAccount() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    // Forget everything this phone remembered about the account, then go back to the join screen.
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('beacon:'));
      await AsyncStorage.multiRemove(keys);
    } catch {}
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.danger}>
      {confirm ? (
        <>
          <Text style={styles.body}>
            <Text style={{ fontWeight: '800' }}>Delete your Beacon account?</Text> Your name, number, friends, circles, beacons and Find a date answers are deleted for good. Nobody is told. You can join again later as new.
          </Text>
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="Keep it" secondary onPress={() => setConfirm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete" onPress={remove} busy={busy} />
            </View>
          </View>
        </>
      ) : (
        <Pressable onPress={() => setConfirm(true)} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.link, styles.underline]}>Delete my account</Text>
        </Pressable>
      )}
    </View>
  );
}

// Small parts ---------------------------------------------------------------------------

const first = (name: string) => name.split(' ')[0];

function Avatar({ name, ghost, big }: { name: string; ghost?: boolean; big?: boolean }) {
  return (
    <View style={[styles.avatar, ghost && styles.avatarGhost, big && styles.avatarBig]}>
      <Text style={[styles.avatarText, ghost && { color: colors.muted }, big && { fontSize: 20 }]}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}

function SmallButton({ label, onPress, invite }: { label: string; onPress: () => void; invite?: boolean }) {
  const ghost = label === 'Invite again';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.small, invite ? styles.smallInvite : ghost ? styles.smallGhost : styles.smallAdd, pressed && styles.pushed]}>
      {invite && <MaterialCommunityIcons name="message-text-outline" size={15} color={colors.ink} />}
      <Text style={[styles.smallText, ghost && { fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

function NewChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.newChip}>
      <Text style={[styles.newChipText]}>+ New</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  link: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  underline: { textDecorationLine: 'underline' },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  body: { fontSize: 16, lineHeight: 22 },
  ok: { fontSize: 14, fontWeight: '800' },
  list: { backgroundColor: colors.card, ...border, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12 },
  rowLine: { borderTopWidth: 1.5, borderTopColor: colors.skyDeep },
  reqRow: { backgroundColor: colors.cream },
  grow: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 13, color: colors.muted },
  chev: { color: colors.muted, fontSize: 18, fontWeight: '600' },
  state: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarGhost: { backgroundColor: colors.card, borderStyle: 'dashed' },
  avatarBig: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontWeight: '800' },
  small: { flexDirection: 'row', alignItems: 'center', gap: 6, ...border, paddingVertical: 5, paddingHorizontal: 12, boxShadow: `2px 2px 0px ${colors.ink}` },
  smallAdd: { backgroundColor: colors.accent },
  smallInvite: { backgroundColor: colors.butter },
  smallGhost: { backgroundColor: colors.card, boxShadow: 'none' },
  smallText: { fontWeight: '800', fontSize: 14 },
  pushed: { boxShadow: 'none', transform: [{ translateX: 2 }, { translateY: 2 }] },
  newChip: { borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12 },
  newChipText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  empty: { borderWidth: 2, borderColor: colors.ink, borderStyle: 'dashed', borderRadius: 4, padding: 18, gap: 8, alignItems: 'center' },
  sheetBody: { gap: 14 },
  code: { alignSelf: 'flex-start', backgroundColor: colors.butter, ...border, ...shadow.select, paddingHorizontal: 10, fontSize: 24, fontWeight: '800', letterSpacing: 4 },
  tick: { width: 24, height: 24, ...border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.butter },
  tickMark: { fontWeight: '800', fontSize: 14 },
  confirm: { gap: 12, borderTopWidth: 1.5, borderTopColor: colors.skyDeep, paddingTop: 12 },
  notice: { gap: 10, backgroundColor: colors.card, ...border, ...shadow.card, padding: 14 },
  noticeTitle: { fontSize: 17, fontWeight: '800' },
  danger: { marginTop: 24, gap: 10, borderTopWidth: 1.5, borderTopColor: colors.skyDeep, paddingTop: 16 },
});
