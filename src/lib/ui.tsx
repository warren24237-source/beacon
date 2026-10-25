import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#0E1116',
  card: '#181C23',
  text: '#F2F4F7',
  muted: '#98A2B3',
  accent: '#F5A524',
  whatsapp: '#25D366',
  error: '#F97066',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({ label, sub, on, onPress }: { label: string; sub?: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      <Text style={styles.chipText}>
        {label}
        {sub ? <Text style={styles.chipSub}>  {sub}</Text> : null}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />;
}

export function Button({
  label,
  onPress,
  busy,
  secondary,
  whatsapp,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  whatsapp?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        whatsapp && { backgroundColor: colors.whatsapp },
        (pressed || busy) && { opacity: 0.7 },
      ]}>
      {busy ? (
        <ActivityIndicator color={secondary ? colors.text : colors.bg} />
      ) : (
        <Text style={[styles.buttonLabel, secondary && { color: colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 18, paddingBottom: 48 },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, borderWidth: 1, borderColor: '#2C3340', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  chipOn: { borderColor: colors.accent, backgroundColor: 'rgba(245,165,36,0.16)' },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  chipSub: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 6 },
  inner: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  error: { color: colors.error, fontSize: 14 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.muted },
  buttonLabel: { color: colors.bg, fontSize: 17, fontWeight: '700' },
});
