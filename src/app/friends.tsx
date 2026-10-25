import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { fetchCircles, fetchFriends, type Circle, type Friend } from '@/lib/beacon';
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
  const myCode = profile?.friend_code ?? undefined;

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([fetchFriends(), fetchCircles()]);
    setFriends(f);
    setCircles(c);
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

  const shareText = `Add me on Beacon so we can see when each other's free. My friend code: ${myCode}`;

  return (
    <ScrollScreen>
      <View style={styles.top}>
        <Text style={styles.h1}>Friends</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>

      <Card>
        <Label>YOUR FRIEND CODE</Label>
        <Text style={styles.code} selectable>
          {myCode ?? '...'}
        </Text>
        <Text style={styles.muted}>Send it to a mate. When they add it, you&apos;re friends both ways.</Text>
        <Button label="Share my code" onPress={() => Share.share({ message: shareText })} />
      </Card>

      <View style={styles.group}>
        <Label>ADD A FRIEND</Label>
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
        {friends.length === 0 && <Text style={styles.muted}>No friends yet. Share your code above.</Text>}
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
  ok: { color: colors.whatsapp, fontSize: 14 },
  code: { color: colors.accent, fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  friend: { gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2C3340' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222833', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '700' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
