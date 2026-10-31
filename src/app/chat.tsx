import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { blockUser, fetchMessages, markRead, MAX_MESSAGE, reportMessage, sendMessage, subscribeToThread, type ChatMessage, type Thread } from '@/lib/chat';
import { placeName, usePlaceNames } from '@/lib/placeui';
import { usePlacesVersion, type BeaconPlace } from '@/lib/places';
import { fetchPoll } from '@/lib/polls';
import { Sheet } from '@/lib/sheet';
import { supabase } from '@/lib/supabase';
import { BackBar, border, colors, ErrorText, goBack, shadow, Text, TextInput } from '@/lib/ui';
import { eventLine } from '@/lib/words';

// Chat on a plan (decision 79, prototype design/prototypes/chat.html).
// Beacon: the owner and everyone who's in. Find a day: everyone asked. Read only once the plan ends.
export default function ChatScreen() {
  const { beacon, poll, title } = useLocalSearchParams<{ beacon?: string; poll?: string; title?: string }>();
  const thread: Thread = useMemo(() => ({ beaconId: beacon ?? null, pollId: poll ?? null }), [beacon, poll]);
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [held, setHeld] = useState<ChatMessage | null>(null);
  const [toast, setToast] = useState('');

  // Still open for messages? A beacon until it ends or is put out; a Find a day until its day (or last date) has passed.
  const checkOpen = useCallback(async () => {
    if (thread.beaconId) {
      const { data } = await supabase.from('beacons').select('end_time, is_active').eq('id', thread.beaconId).maybeSingle();
      setOpen(!!data && data.is_active && new Date(data.end_time) > new Date());
    } else if (thread.pollId) {
      const p = await fetchPoll(thread.pollId);
      const last = p ? (p.locked_day ?? [...p.dates].sort().at(-1)) : null;
      const today = new Date();
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setOpen(!!last && last >= ymd);
    }
  }, [thread]);

  const load = useCallback(async () => {
    const m = await fetchMessages(thread);
    setMessages(m);
    markRead(thread);
  }, [thread]);

  useFocusEffect(
    useCallback(() => {
      load();
      checkOpen();
      // Live updates where Realtime is available, with a slow poll as a safety net.
      const off = subscribeToThread(thread, load);
      const t = setInterval(load, 20000);
      return () => {
        off();
        clearInterval(t);
      };
    }, [load, checkOpen, thread])
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Place names in event lines ("Warren locked it in at Ye Olde Trip").
  const eventPlaces = useMemo<BeaconPlace[]>(
    () => (messages ?? []).filter((m) => m.kind === 'event' && m.meta?.place_id).map((m) => ({ position: 0, starred: false, place_id: m.meta!.place_id!, label: null })),
    [messages]
  );
  usePlaceNames(eventPlaces);
  const v = usePlacesVersion();

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    const { error } = await sendMessage(thread, body);
    setBusy(false);
    if (error) {
      setError(error.message);
      checkOpen();
      return;
    }
    setText('');
    load();
  }

  function confirmBlock(m: ChatMessage) {
    const name = m.profiles?.full_name ?? 'them';
    setHeld(null);
    Alert.alert(`Block ${name}?`, `You won't be friends any more, and you won't see each other's beacons, chats or numbers. ${name} isn't told.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUser(m.user_id);
          if (error) return setError(error.message);
          setToast(`Blocked ${name}.`);
          load();
        },
      },
    ]);
  }

  const reversed = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const nameOf = (m: ChatMessage) => (m.user_id === userId ? 'You' : m.profiles?.full_name ?? 'Someone');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.bar}>
          <BackBar
            title={title || 'Chat'}
            sub={thread.beaconId ? 'Only the people who are in can see this' : 'Everyone asked can see this'}
            onBack={goBack}
          />
        </View>

        <FlatList
          inverted
          data={reversed}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            messages && !messages.length ? <Text style={[styles.sys, { marginBottom: 12 }]}>Nothing yet. Say hi.</Text> : undefined
          }
          ListHeaderComponent={!open ? <Text style={[styles.sys, { marginTop: 8 }]}>This plan has ended. The chat goes 7 days after.</Text> : undefined}
          renderItem={({ item: m }) => {
            if (m.kind === 'event') {
              const place = m.meta && (m.meta.label || m.meta.place_id)
                ? placeName({ position: 0, starred: false, place_id: m.meta.place_id ?? null, label: m.meta.label ?? null }, v)
                : undefined;
              const line = eventLine(m.body, nameOf(m), m.meta, place);
              return line ? <Text style={styles.sys}>{line}</Text> : null;
            }
            const me = m.user_id === userId;
            return (
              <View style={[styles.msg, me && styles.msgMe]}>
                {!me && <Text style={styles.who}>{m.profiles?.full_name ?? 'Someone'}</Text>}
                <Pressable
                  onLongPress={me ? undefined : () => setHeld(m)}
                  delayLongPress={350}
                  accessibilityHint={me ? undefined : 'Hold to report or block'}
                  style={[styles.bubble, me && styles.bubbleMe]}>
                  <Text style={styles.body}>{m.body}</Text>
                </Pressable>
              </View>
            );
          }}
        />

        {toast ? <Text style={styles.toast}>{toast}</Text> : null}
        <ErrorText>{error}</ErrorText>
        {open ? (
          <View style={styles.compose}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Say something"
              maxLength={MAX_MESSAGE}
              multiline
              style={styles.input}
              accessibilityLabel="Message"
            />
            <Pressable
              onPress={send}
              disabled={busy || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, (!text.trim() || busy) && { opacity: 0.5 }, pressed && styles.pressed]}>
              <Text style={styles.sendText}>{busy ? '…' : 'Send'}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.ended}>Read only now.</Text>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={!!held} onClose={() => setHeld(null)} fit>
        {held && (
          <View style={{ gap: 10, paddingBottom: 8 }}>
            <Text style={styles.h2}>{held.profiles?.full_name ?? 'Their'}&apos;s message</Text>
            <Text style={styles.quote}>&ldquo;{held.body}&rdquo;</Text>
            <Pressable
              style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
              accessibilityRole="button"
              onPress={async () => {
                const id = held.id;
                setHeld(null);
                const { error } = await reportMessage(id);
                setToast(error ? error.message : 'Reported. Thanks, Warren will look at it.');
              }}>
              <Text style={styles.pickText}>Report this message</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.pick, pressed && styles.pressed]} accessibilityRole="button" onPress={() => confirmBlock(held)}>
              <Text style={[styles.pickText, { color: colors.error }]}>Block {held.profiles?.full_name ?? 'them'}</Text>
            </Pressable>
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: colors.ink },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  sys: { alignSelf: 'center', textAlign: 'center', fontSize: 13, color: colors.muted, fontWeight: '600', paddingVertical: 2, paddingHorizontal: 12 },
  msg: { maxWidth: '82%', alignSelf: 'flex-start', gap: 2 },
  msgMe: { alignSelf: 'flex-end' },
  who: { fontSize: 12, fontWeight: '800', color: colors.muted, paddingLeft: 2 },
  bubble: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 10, borderBottomLeftRadius: 2, paddingVertical: 7, paddingHorizontal: 11 },
  bubbleMe: { backgroundColor: colors.butter, borderBottomLeftRadius: 10, borderBottomRightRadius: 2 },
  body: { fontSize: 16, lineHeight: 21 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderTopWidth: 2, borderTopColor: colors.ink },
  input: { flex: 1, maxHeight: 120, paddingVertical: 10 },
  send: { backgroundColor: colors.accent, ...border, ...shadow.select, paddingVertical: 11, paddingHorizontal: 14 },
  sendText: { fontSize: 16, fontWeight: '800' },
  pressed: { boxShadow: 'none', transform: [{ translateX: 2 }, { translateY: 2 }] },
  ended: { textAlign: 'center', color: colors.muted, fontSize: 14, paddingVertical: 14, borderTopWidth: 2, borderTopColor: colors.ink },
  toast: { textAlign: 'center', fontSize: 14, fontWeight: '800', paddingVertical: 6 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  quote: { fontSize: 15, color: colors.muted },
  pick: { backgroundColor: colors.card, ...border, ...shadow.select, paddingVertical: 12, paddingHorizontal: 12 },
  pickText: { fontSize: 16, fontWeight: '800' },
});
