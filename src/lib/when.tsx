import { StyleSheet, View } from 'react-native';

import { colors, Text } from './ui';

/** The day and time on a beacon: coral "Now · till 6pm" while live, otherwise "Sat 31 · 9am to 12pm" (decision 51). */
export function WhenTag({ text, live }: { text: string; live: boolean }) {
  return (
    <View style={[styles.when, live && styles.live]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  when: { borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 7, paddingVertical: 1, flexShrink: 0 },
  live: { backgroundColor: colors.accent },
  text: { fontSize: 12, fontWeight: '800' },
});
