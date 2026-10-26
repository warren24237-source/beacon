import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { colors } from './ui';

// The lit beacon: the lamp from the app icon, with two coral rings pulsing outwards.
// flash: a one-off burst as it lights (decision 43).
export function BeaconGlow({ size = 140, flash }: { size?: number; flash?: boolean }) {
  const [a] = useState(() => new Animated.Value(0));
  const [b] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(flash ? 0 : 1));

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return pop.setValue(1);
      if (flash) Animated.timing(pop, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
  }, [a, b, pop, flash]);

  const ring = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
  });
  const lampPop = { transform: [{ scale: pop.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.8, 1.18, 1] }) }] };
  const burst = {
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] }) }],
    opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
  };

  const disc = size * 0.62;
  const core = disc * 0.38;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {flash && <Animated.View style={[styles.burst, { width: size, height: size, borderRadius: size / 2 }, burst]} />}
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(a)]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring(b)]} />
      {/* The lamp: cream disc, coral core, ink outline and a hard shadow, as in the app icon. */}
      <Animated.View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2, boxShadow: `${Math.round(disc * 0.08)}px ${Math.round(disc * 0.08)}px 0px ${colors.ink}` }, lampPop]}>
        <View style={[styles.core, { width: core, height: core, borderRadius: core / 2 }]} />
      </Animated.View>
    </View>
  );
}

// The unlit beacon: a plain lamp you tap to light (decision 43).
export function UnlitLamp({ size = 140, onPress }: { size?: number; onPress: () => void }) {
  const disc = size * 0.62;
  const core = disc * 0.38;
  const off = Math.round(disc * 0.08);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Light my beacon" style={[styles.wrap, { width: size, height: size }]}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.disc,
              { backgroundColor: colors.card, width: disc, height: disc, borderRadius: disc / 2 },
              pressed ? { transform: [{ translateX: off }, { translateY: off }] } : { boxShadow: `${off}px ${off}px 0px ${colors.ink}` },
            ]}>
            <View style={[styles.core, { backgroundColor: colors.bg, width: core, height: core, borderRadius: core / 2 }]} />
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: colors.accent },
  burst: { position: 'absolute', backgroundColor: colors.accent },
  disc: { backgroundColor: colors.cream, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  core: { backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.ink },
});
