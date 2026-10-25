import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#0E1116',
  card: '#181C23',
  text: '#F2F4F7',
  muted: '#98A2B3',
  accent: '#F5A524',
  error: '#F97066',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
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
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
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
