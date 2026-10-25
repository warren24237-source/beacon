import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from './ui';

// The lit beacon: a glowing core with two rings pulsing outwards, like the prototype.
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

  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(a)]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(b)]} />
      <View style={[styles.core, { width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  core: { backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 1, shadowRadius: 24, elevation: 16 },
});
