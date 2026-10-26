import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { callNumber, openSms, openWhatsApp } from './beacon';
import { colors, Text } from './ui';

// The three ways to reach one person (decision 45). Each goes straight to them.
// Icons always carry a word underneath (decision 42).
export function ReplyIcons({ name, phone, text, compact }: { name: string; phone: string | null; text: string; compact?: boolean }) {
  if (!phone) return <Text style={styles.none}>{name} hasn&apos;t added a number.</Text>;
  const size = compact ? 20 : 28;
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Tile label="WhatsApp" a11y={`WhatsApp ${name}`} compact={compact} bg={colors.whatsapp} onPress={() => openWhatsApp(text, phone)}>
        <FontAwesome name="whatsapp" size={size + 2} color={colors.ink} />
      </Tile>
      <Tile label="Messages" a11y={`Text ${name}`} compact={compact} onPress={() => openSms(phone, text)}>
        <MaterialCommunityIcons name="message-text-outline" size={size} color={colors.ink} />
      </Tile>
      <Tile label="Call" a11y={`Call ${name}`} compact={compact} bg={colors.butter} onPress={() => callNumber(phone)}>
        <MaterialCommunityIcons name="phone" size={size} color={colors.ink} />
      </Tile>
    </View>
  );
}

function Tile({ label, a11y, compact, bg = colors.card, onPress, children }: { label: string; a11y: string; compact?: boolean; bg?: string; onPress: () => void; children: ReactNode }) {
  const box = compact ? 40 : 56;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4} style={[styles.tile, compact && styles.tileCompact]}>
      {({ pressed }) => (
        <>
          <View style={[styles.box, { width: box, height: box, borderRadius: compact ? 10 : 14, backgroundColor: bg }, pressed ? pushed : shadow3]}>{children}</View>
          <Text style={[styles.label, compact && { fontSize: 11 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const shadow3: ViewStyle = { boxShadow: `3px 3px 0px ${colors.ink}` };
const pushed: ViewStyle = { boxShadow: 'none', transform: [{ translateX: 3 }, { translateY: 3 }] };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 },
  rowCompact: { justifyContent: 'flex-end', gap: 0, paddingVertical: 0, flexShrink: 0 },
  tile: { flex: 1, alignItems: 'center', gap: 6 },
  tileCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 62, gap: 4 },
  box: { borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  none: { color: colors.muted, fontSize: 13 },
});
