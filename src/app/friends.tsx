import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { INSTALL_LINK } from '@/lib/invite';
import { fetchCircles, fetchFriends, type Circle, type Friend } from '@/lib/beacon';
import { findContactsOnBeacon, type ContactMatch } from '@/lib/contacts';
import { normaliseWhatsAppNumber } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { Button, Card, Chip, Chips, colors, ErrorText, Label, ScrollScreen } from '@/lib/ui';

export default function Friends() {
  const { profile, session } = useAuth();
  const userId = session?.user.id ?? '';
  const [friends, setFriends] = useState<Friend[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [code, setCode] = useState('');
  const [newCircle, setNewCircle] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<{ from_id: string; full_name: string }[]>([]);
  const [contacts, setContacts] = useState<ContactMatch[] | null>(null);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [number, setNumber] = useState('');
  const myCode = profile?.friend_code ?? undefined;

  const load = useCallback(async () => {
    const [f, c, r] = await Promise.all([fetchFriends(), fetchCircles(), supabase.rpc('incoming_friend_requests')]);
    setFriends(f);
    setCircles(c);
    setRequests((r.data ?? []) as { from_id: string; full_name: string }[]);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addFriend() {
    setError('');
    setMsg('');
    if (!code.trim()) return setError('Type the friend code your mate sent you.');
    setBusy(true);
    const { data, error } = await supabase.rpc('add_friend', { p_code: code.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    setCode('');
    setMsg(`You and ${data} are now friends.`);
    load();
  }

  async function respond(fromId: string, accept: boolean) {
    await supabase.rpc('respond_friend_request', { p_from: fromId, p_accept: accept });
    load();
    if (contacts) refreshContacts();
  }

  async function refreshContacts() {
    setError('');
    setContactsBusy(true);
    const res = await findContactsOnBeacon();
    setContactsBusy(false);
    if (!res.ok) return setError(res.reason);
    setContacts(res.matches);
  }

  async function requestContact(m: ContactMatch) {
    setError('');
    const { data, error } = await supabase.rpc('request_friend', { p_user_id: m.id });
    if (error) return setError(error.message);
    setContacts((cs) => (cs ?? []).map((c) => (c.id === m.id ? { ...c, status: data === 'friends' ? 'friends' : 'requested' } : c)));
    if (data === 'friends') load();
  }

  async function requestByNumber() {
    setError('');
    setMsg('');
    const n = normaliseWhatsAppNumber(number);
    if (!n) return setError('That number does not look right. Try e.g. 07700 900123.');
    const { data, error } = await supabase.rpc('request_friend_by_phone', { p_phone_number: n });
    if (error) return setError(error.message);
    setNumber('');
    setMsg(data === 'friends' ? 'You are now friends.' : 'Request sent. They need to accept it.');
    load();
  }

  async function addCircle() {
    setError('');
    const name = newCircle.trim();
    if (!name) return;
    const { error } = await supabase.from('circles').insert({ name, owner_id: userId });
    if (error) return setError(error.message);
    setNewCircle('');
    load();
  }

  async function toggle(circle: Circle, friendId: string) {
    const isIn = circle.member_ids.includes(friendId);
    if (isIn) await supabase.from('circle_members').delete().eq('circle_id', circle.id).eq('member_id', friendId);
    else await supabase.from('circle_members').insert({ circle_id: circle.id, member_id: friendId });
    load();
  }

  async function deleteCircle(c: Circle) {
    await supabase.from('circles').delete().eq('id', c.id);
    load();
  }

  const inviteText = `I'm using Beacon to tell mates when I'm free for a drink, coffee or whatever. Fancy it? Android only for now.

1. Install: ${INSTALL_LINK}
2. Open it and use the join code: join-me
3. Add me with my code: ${myCode ?? ''}`;

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Text style={styles.h1}>Friends</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      <Card>
        <Text style={styles.inviteTitle}>Invite a mate to Beacon</Text>
        <Text style={styles.muted}>
          Sends one message with the download link, the join code and your friend code. When they join, you&apos;re friends straight away.
        </Text>
        <Button label="Invite a mate" onPress={() => Share.share({ message: inviteText })} />
      </Card>

      {requests.length > 0 && (
        <View style={styles.group}>
          <Label>FRIEND REQUESTS</Label>
          {requests.map((r) => (
            <View key={r.from_id} style={styles.friendRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{r.full_name[0]}</Text>
              </View>
              <Text style={[styles.name, { flex: 1 }]}>{r.full_name}</Text>
              <Pressable style={styles.pill} onPress={() => respond(r.from_id, true)}>
                <Text style={styles.pillText}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => respond(r.from_id, false)} hitSlop={8}>
                <Text style={styles.link}>Decline</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.group}>
        <Label>FIND FRIENDS</Label>
        <Button label={contacts ? 'Check contacts again' : 'Find friends in my contacts'} onPress={refreshContacts} busy={contactsBusy} />
        {contacts && contacts.length === 0 && <Text style={styles.muted}>None of your contacts are on Beacon yet. Share your code below.</Text>}
        {contacts?.map((m) => (
          <View key={m.id} style={styles.friendRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.full_name[0]}</Text>
            </View>
            <Text style={[styles.name, { flex: 1 }]}>{m.full_name}</Text>
            {m.status === 'friends' && <Text style={styles.muted}>Friends</Text>}
            {m.status === 'requested' && <Text style={styles.muted}>Requested</Text>}
            {m.status === 'incoming' && (
              <Pressable style={styles.pill} onPress={() => respond(m.id, true)}>
                <Text style={styles.pillText}>Accept</Text>
              </Pressable>
            )}
            {m.status === 'none' && (
              <Pressable style={styles.pill} onPress={() => requestContact(m)}>
                <Text style={styles.pillText}>Add</Text>
              </Pressable>
            )}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={number}
            onChangeText={setNumber}
            keyboardType="phone-pad"
            placeholder="Or add by mobile number"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 1 }]}
          />
          <View style={{ width: 90 }}>
            <Button label="Add" secondary onPress={requestByNumber} />
          </View>
        </View>
      </View>

      <Card>
        <Label>YOUR FRIEND CODE</Label>
        <Text style={styles.code} selectable>
          {myCode ?? '...'}
        </Text>
        <Text style={styles.muted}>For mates who already have Beacon. When they add it, you&apos;re friends straight away.</Text>
      </Card>

      <View style={styles.group}>
        <Label>ADD A FRIEND&apos;S CODE</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="Their code, e.g. 4923EA"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 1 }]}
          />
          <View style={{ width: 90 }}>
            <Button label="Add" onPress={addFriend} busy={busy} />
          </View>
        </View>
        {msg ? <Text style={styles.ok}>{msg}</Text> : null}
        <ErrorText>{error}</ErrorText>
      </View>

      <View style={styles.group}>
        <Label>YOUR CIRCLES · ONLY YOU SEE THESE</Label>
        <Chips>
          {circles.map((c) => (
            <Chip key={c.id} label={c.name} sub={String(c.member_ids.length)} onPress={() => {}} />
          ))}
        </Chips>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={newCircle}
            onChangeText={setNewCircle}
            maxLength={30}
            placeholder="New circle, e.g. Uni"
            placeholderTextColor={colors.muted}
            style={[styles.input, { flex: 1 }]}
            onSubmitEditing={addCircle}
          />
          <View style={{ width: 90 }}>
            <Button label="Create" secondary onPress={addCircle} />
          </View>
        </View>
      </View>

      <View style={styles.group}>
        <Label>
          {friends.length} {friends.length === 1 ? 'FRIEND' : 'FRIENDS'} · TAP TO SORT INTO CIRCLES
        </Label>
        {friends.length === 0 && <Text style={styles.muted}>No friends yet. Invite a mate above.</Text>}
        {friends.map((f) => {
          const inCircles = circles.filter((c) => c.member_ids.includes(f.id)).map((c) => c.name);
          return (
            <View key={f.id} style={styles.friend}>
              <Pressable onPress={() => setOpen(open === f.id ? null : f.id)} style={styles.friendRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{f.full_name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{f.full_name}</Text>
                  <Text style={styles.muted}>{inCircles.length ? inCircles.join(', ') : 'No circle'}</Text>
                </View>
                <Text style={styles.link}>{open === f.id ? 'Done' : 'Edit'}</Text>
              </Pressable>
              {open === f.id && (
                <Chips>
                  {circles.length === 0 && <Text style={styles.muted}>Create a circle above first.</Text>}
                  {circles.map((c) => (
                    <Chip key={c.id} label={c.name} on={c.member_ids.includes(f.id)} onPress={() => toggle(c, f.id)} />
                  ))}
                </Chips>
              )}
            </View>
          );
        })}
      </View>

      {circles.length > 0 && (
        <View style={styles.group}>
          <Label>REMOVE A CIRCLE</Label>
          <Chips>
            {circles.map((c) => (
              <Chip key={c.id} label={`Delete ${c.name}`} onPress={() => deleteCircle(c)} />
            ))}
          </Chips>
        </View>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800' },
  link: { color: colors.muted, fontSize: 15 },
  group: { gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  inviteTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  ok: { color: colors.whatsapp, fontSize: 14 },
  code: { color: colors.accent, fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  friend: { gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2C3340' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222833', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '700' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pill: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  pillText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
});
