import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Beacon design system: poster style, sky and coral (decision 41).
// Source of truth: design/design-system.html in Warren's Beacon folder.
export const colors = {
  bg: '#DCECFF', // sky
  skyDeep: '#C3DBF7',
  card: '#FFFFFF',
  text: '#161616', // ink
  ink: '#161616',
  muted: '#44526A',
  accent: '#FF6B4A', // coral: the beacon and "I'm in". Never body text
  butter: '#FFD84D', // selected options, "lit" badge
  cream: '#FFF7D6',
  whatsapp: '#25D366',
  error: '#B42318',
};

export const fonts = {
  regular: 'BricolageGrotesque_400Regular',
  semibold: 'BricolageGrotesque_600SemiBold',
  extrabold: 'BricolageGrotesque_800ExtraBold',
};

export const border = { borderWidth: 2, borderColor: colors.ink, borderRadius: 4 } as const;
export const shadow = {
  card: { boxShadow: `4px 4px 0px ${colors.ink}` } as ViewStyle,
  select: { boxShadow: `3px 3px 0px ${colors.ink}` } as ViewStyle,
  primary: { boxShadow: `4px 4px 0px ${colors.accent}` } as ViewStyle,
};
// Pressed: the shadow goes and the element drops into its place.
const pushed = (by: number): ViewStyle => ({ boxShadow: 'none', transform: [{ translateX: by }, { translateY: by }] });

function family(weight: TextStyle['fontWeight']): string {
  const w = String(weight ?? '400');
  if (w === 'bold' || Number(w) >= 700) return fonts.extrabold;
  if (Number(w) >= 500) return fonts.semibold;
  return fonts.regular;
}

/** Text in Beacon's font. fontWeight picks the right font file, so styles can keep using weights. */
export function Text({ style, ...props }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, fontFamily, ...rest } = flat;
  return <RNText {...props} style={[{ color: colors.text }, rest, { fontFamily: fontFamily ?? family(fontWeight) }]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, style, { fontFamily: fonts.regular }]} />;
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.inner}>{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      {/* Shrink the screen when the keyboard opens, so the field being typed in stays visible. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({
  label,
  sub,
  on,
  onPress,
  icon,
  dashed,
}: {
  label: string;
  sub?: string;
  on?: boolean;
  onPress: () => void;
  /** A small mark before the label, e.g. the clock on a recent activity. */
  icon?: ReactNode;
  /** Dashed outline for "add your own" style chips. */
  dashed?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, icon ? styles.chipRow : null, dashed && styles.chipDashed, on && styles.chipOn, pressed && pushed(on ? 3 : 0)]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}>
      {icon}
      <Text style={styles.chipText}>
        {label}
        {sub ? <Text style={styles.chipSub}> {sub}</Text> : null}
      </Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
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
  return <TextInput {...props} />;
}

type Variant = 'primary' | 'accent' | 'butter' | 'secondary' | 'whatsapp';

/**
 * primary: ink with a coral shadow, one per screen. accent: coral, for "I'm in". butter: yellow, for "Lock it in".
 * secondary: white. whatsapp: green, only when it opens WhatsApp.
 */
export function Button({
  label,
  onPress,
  busy,
  secondary,
  whatsapp,
  variant,
  compact,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  whatsapp?: boolean;
  variant?: Variant;
  compact?: boolean;
}) {
  const v: Variant = variant ?? (whatsapp ? 'whatsapp' : secondary ? 'secondary' : 'primary');
  const labelColor = v === 'primary' ? colors.bg : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        v === 'primary' && styles.buttonPrimary,
        v === 'accent' && styles.buttonAccent,
        v === 'butter' && styles.buttonButter,
        v === 'secondary' && styles.buttonSecondary,
        v === 'whatsapp' && styles.buttonWhatsapp,
        (pressed || busy) && pushed(v === 'primary' ? 4 : 0),
        busy && { opacity: 0.7 },
      ]}>
      {busy ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.buttonLabel, compact && { fontSize: 16 }, v === 'secondary' && { fontWeight: '600' }, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 18, paddingBottom: 48 },
  inner: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, ...border, paddingVertical: 8, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.butter, ...shadow.select },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipDashed: { borderStyle: 'dashed', backgroundColor: colors.bg },
  chipText: { fontSize: 15, fontWeight: '600' },
  chipSub: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  card: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 16, gap: 6 },
  title: { fontSize: 32, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 },
  body: { fontSize: 16, lineHeight: 22 },
  error: { color: colors.error, fontSize: 14, fontWeight: '600' },
  input: { backgroundColor: colors.card, color: colors.ink, ...border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17 },
  button: { ...border, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonCompact: { paddingVertical: 7, alignSelf: 'flex-start' },
  buttonPrimary: { backgroundColor: colors.ink, ...shadow.primary },
  buttonAccent: { backgroundColor: colors.accent },
  buttonButter: { backgroundColor: colors.butter },
  buttonSecondary: { backgroundColor: colors.card },
  buttonWhatsapp: { backgroundColor: colors.whatsapp },
  buttonLabel: { fontSize: 17, fontWeight: '800' },
});
