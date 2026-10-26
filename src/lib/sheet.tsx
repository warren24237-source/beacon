import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from './ui';

/**
 * A bottom sheet, three quarters of the screen, you can drag down to close (from the handle, or anywhere once
 * scrolled to the top). Tapping the dimmed area or the back button also closes it.
 */
export const Sheet = forwardRef<ScrollViewInstance, { visible: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode }>(function Sheet(
  { visible, onClose, footer, children },
  scrollRef
) {
  const [y] = useState(() => new Animated.Value(0));
  const atTop = useRef(true);
  const insets = useSafeAreaInsets();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      y.setValue(0);
      atTop.current = true;
    }
  }, [visible, y]);

  const [{ grip, body }] = useState(() => {
    const drags = (dy: number, dx: number) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5;
    const move = (_e: unknown, g: { dy: number }) => y.setValue(Math.max(0, g.dy));
    const release = (_e: unknown, g: { dy: number; vy: number }) => {
      if (g.dy > 100 || g.vy > 0.8) {
        Animated.timing(y, { toValue: Dimensions.get('window').height, duration: 180, useNativeDriver: true }).start(() => closeRef.current());
      } else {
        Animated.spring(y, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
      }
    };
    const back = () => Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    return {
      // The top strip: claims the touch as soon as a finger lands, so scrolling can't steal it.
      grip: PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: move,
        onPanResponderRelease: release,
        onPanResponderTerminate: back,
      }),
      // The rest of the sheet: a downward drag once the form is scrolled to the top (best effort on Android).
      body: PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => atTop.current && drags(g.dy, g.dx),
        onMoveShouldSetPanResponder: (_e, g) => atTop.current && drags(g.dy, g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: move,
        onPanResponderRelease: release,
        onPanResponderTerminate: back,
      }),
    };
  });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        {/* Three quarters of the screen, shrinking (not sliding off the top) when the keyboard is open. */}
        <Animated.View style={[styles.sheet, { height: Dimensions.get('window').height * 0.75 + insets.bottom, transform: [{ translateY: y }] }]} {...body.panHandlers}>
          <View style={styles.handleZone} accessibilityLabel="Drag down to close" {...grip.panHandlers}>
            <View style={styles.grab} />
          </View>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(e) => {
              atTop.current = e.nativeEvent.contentOffset.y <= 0;
            }}>
            {children}
          </ScrollView>
          {/* Padded by the Android navigation bar's height so the button is never behind it. */}
          {footer ? <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>{footer}</View> : <View style={{ height: insets.bottom }} />}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 'rgba(22,22,22,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopWidth: 2, borderColor: colors.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, flexShrink: 1 },
  scrim: { flexGrow: 1, flexBasis: 0, minHeight: 48 },
  handleZone: { paddingTop: 12, paddingBottom: 22, alignItems: 'center' },
  grab: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.ink, opacity: 0.4 },
  content: { paddingHorizontal: 22, paddingBottom: 16 },
  footer: { paddingHorizontal: 22, paddingTop: 12, borderTopWidth: 2, borderTopColor: colors.ink, backgroundColor: colors.bg },
});
