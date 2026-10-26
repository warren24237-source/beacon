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

  const [pan] = useState(() => {
    const drags = (dy: number, dx: number) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.5;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => atTop.current && drags(g.dy, g.dx),
      onMoveShouldSetPanResponder: (_e, g) => drags(g.dy, g.dx),
      onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 0.9) {
          Animated.timing(y, { toValue: Dimensions.get('window').height, duration: 180, useNativeDriver: true }).start(() => closeRef.current());
        } else {
          Animated.spring(y, { toValue: 0, bounciness: 4, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
    });
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.wrap}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        {/* Three quarters of the screen, shrinking (not sliding off the top) when the keyboard is open. */}
        <Animated.View style={[styles.sheet, { height: Dimensions.get('window').height * 0.75, transform: [{ translateY: y }] }]} {...pan.panHandlers}>
          <View style={styles.handleZone} accessibilityLabel="Drag down to close">
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
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: 'rgba(22,22,22,0.45)' },
  sheet: { backgroundColor: colors.bg, borderTopWidth: 2, borderColor: colors.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, flexShrink: 1 },
  scrim: { flexGrow: 1, flexBasis: 0, minHeight: 48 },
  handleZone: { paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  grab: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.ink, opacity: 0.4 },
  content: { paddingHorizontal: 22, paddingBottom: 16 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22, borderTopWidth: 2, borderTopColor: colors.ink, backgroundColor: colors.bg },
});
