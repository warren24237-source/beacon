import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from './ui';

// The lit beacon: the lamp from the app icon, with two coral rings pulsing outwards.
export function BeaconGlow({ size = 140 }: { size?: number }) {
  const [a] = useState(() => new Animated.Value(0));
  const [b] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      const make = (v: Animated.Value) =>
        Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
      const la = make(a);
      const lb = Animated.sequence([Animated.delay(1200), make(b)]);
      loops = [la, lb];
      la.start();
      lb.start();
    });
    return () => {
      cancelled = true;
      loops.forEach((l) => l.stop());
    };
  }, [a, b]);

  const ring = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
  });

  const disc = size * 0.62;
  const core = disc * 0.38;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(a)]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(b)]} />
      {/* The lamp: cream disc, coral core, ink outline and a hard shadow, as in the app icon. */}
      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, boxShadow: `${Math.round(disc * 0.08)}px ${Math.round(disc * 0.08)}px 0px ${colors.ink}` }]}>
        <View style={[styles.core, { width: core, height: core, borderRadius: core / 2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: colors.accent },
  disc: { backgroundColor: colors.cream, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  core: { backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.ink },
});
