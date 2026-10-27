import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { border, colors, shadow, Text } from './ui';

// Tapping the lamp forks it in two (decision 69). The difference is who picks the time:
// "Up for something" (you do, friends say I'm in) or "Find a day" (they do, friends tick dates).
export function LampFork({ name, onNow, onPlan }: { name: string; onNow: () => void; onPlan: () => void }) {
  const [lines] = useState(() => new Animated.Value(0));
  const [a] = useState(() => new Animated.Value(0));
  const [b] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return [lines, a, b].forEach((v) => v.setValue(1));
      Animated.timing(lines, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.stagger(60, [
        Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.spring(b, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [lines, a, b]);

  // Each option drops out of the lamp: from above and towards the middle, small, to its place.
  const drop = (v: Animated.Value, side: 1 | -1) => ({
    opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) },
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [side * 50, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
    ],
  });

  return (
    <View style={styles.wrap}>
      {/* The fork: a short stem from the lamp that splits left and right. */}
      <Animated.View style={[styles.lines, { opacity: lines, transform: [{ scaleY: lines }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.stem} />
        <View style={styles.bar} />
        <View style={styles.legs}>
          <View style={styles.leg} />
          <View style={styles.leg} />
        </View>
      </Animated.View>

      <View style={styles.branches}>
        <Animated.View style={[{ flex: 1 }, drop(a, 1)]}>
          <Branch tone="now" title="Up for something" who="You set the time" foot="Friends say I'm in." onPress={onNow}>
            <View style={styles.mini}>
              <Text style={styles.miniText}>{name ? `${name}'s up for drinks, tonight` : 'Up for drinks, tonight'}</Text>
              <View style={styles.miniIn}>
                <Text style={styles.miniInText}>I&apos;m in</Text>
              </View>
            </View>
          </Branch>
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, drop(b, -1)]}>
          <Branch tone="plan" title="Find a day" who="They pick the time" foot="Friends tick when they're free." onPress={onPlan}>
            <View style={[styles.mini, { backgroundColor: colors.bg }]}>
              {[
                ['Fri', true],
                ['Sat', true],
                ['Sun', false],
              ].map(([d, on]) => (
                <View key={d as string} style={styles.tickRow}>
                  <Text style={styles.miniText}>{d as string}</Text>
                  <View style={[styles.tick, on ? { backgroundColor: colors.butter } : null]}>
                    <Text style={styles.tickText}>{on ? '✓' : '×'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Branch>
        </Animated.View>
      </View>
    </View>
  );
}

function Branch({
  tone,
  title,
  who,
  foot,
  onPress,
  children,
}: {
  tone: 'now' | 'plan';
  title: string;
  who: string;
  foot: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${who}. ${foot}`}
      style={({ pressed }) => [styles.branch, tone === 'now' ? styles.now : styles.plan, pressed && styles.pressed]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.who}>{who.toUpperCase()}</Text>
      {children}
      <Text style={[styles.foot, tone === 'plan' && { color: colors.muted }]}>{foot}</Text>
    </Pressable>
  );
}

const LINE = 3;
const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', marginTop: -12 },
  lines: { width: '52%', alignItems: 'center', transformOrigin: 'top' },
  stem: { width: LINE, height: 12, backgroundColor: colors.ink },
  bar: { alignSelf: 'stretch', height: LINE, backgroundColor: colors.ink, borderRadius: 2 },
  legs: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' },
  leg: { width: LINE, height: 12, backgroundColor: colors.ink },
  branches: { flexDirection: 'row', gap: 12, width: '100%', alignItems: 'stretch' },
  branch: { flex: 1, ...border, ...shadow.card, paddingVertical: 14, paddingHorizontal: 12, gap: 5 },
  now: { backgroundColor: colors.accent },
  plan: { backgroundColor: colors.card },
  pressed: { transform: [{ translateX: 4 }, { translateY: 4 }], boxShadow: 'none' },
  title: { fontSize: 19, lineHeight: 21, fontWeight: '800', letterSpacing: -0.4 },
  who: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  foot: { fontSize: 13, lineHeight: 17 },
  mini: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 6, padding: 7, gap: 5, marginVertical: 2 },
  miniText: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  miniIn: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.ink, paddingHorizontal: 6 },
  miniInText: { fontSize: 11, fontWeight: '800' },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tick: { width: 16, height: 16, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
});
