import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { callNumber, openSms } from './beacon';
import { colors, Text } from './ui';

// How to reach one person (decision 52): Message and Call, straight to them. Message opens
// whichever messaging app their phone uses, so Beacon isn't tied to WhatsApp or anything else.
// Full size: icons with a word underneath (decision 42). Compact (who's in on your beacon):
// small icons on one line with the name, no words; screen readers still get "Message Kat" etc.
export function ReplyIcons({ name, phone, text, compact }: { name: string; phone: string | null; text: string; compact?: boolean }) {
  if (!phone) return <Text style={styles.none}>No number</Text>;
  const size = compact ? 18 : 28;
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Tile label="Message" a11y={`Message ${name}`} compact={compact} onPress={() => openSms(phone, text)}>
        <MaterialCommunityIcons name="message-text-outline" size={size} color={colors.ink} />
      </Tile>
      <Tile label="Call" a11y={`Call ${name}`} compact={compact} bg={colors.butter} onPress={() => callNumber(phone)}>
        <MaterialCommunityIcons name="phone" size={size} color={colors.ink} />
      </Tile>
    </View>
  );
}

function Tile({ label, a11y, compact, bg = colors.card, onPress, children }: { label: string; a11y: string; compact?: boolean; bg?: string; onPress: () => void; children: ReactNode }) {
  const box = compact ? 34 : 56;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={compact ? 6 : 4} style={compact ? styles.tileCompact : styles.tile}>
      {({ pressed }) => (
        <>
          <View style={[styles.box, { width: box, height: box, borderRadius: compact ? 9 : 14, backgroundColor: bg }, pressed ? pushed : compact ? shadow2 : shadow3]}>{children}</View>
          {!compact && <Text style={styles.label}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

const shadow3: ViewStyle = { boxShadow: `3px 3px 0px ${colors.ink}` };
const shadow2: ViewStyle = { boxShadow: `2px 2px 0px ${colors.ink}` };
const pushed: ViewStyle = { boxShadow: 'none', transform: [{ translateX: 3 }, { translateY: 3 }] };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 40, paddingVertical: 4 },
  rowCompact: { justifyContent: 'flex-end', gap: 8, paddingVertical: 0, flexShrink: 0 },
  tile: { flex: 1, alignItems: 'center', gap: 6 },
  tileCompact: { flexGrow: 0, flexShrink: 0 },
  box: { borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  none: { color: colors.muted, fontSize: 13 },
});
