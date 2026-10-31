import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MONTHS, parseYmd, todayYmd, ymd } from './polls';
import { border, colors, shadow, Text } from './ui';

// A month grid. Tap days to select. Past days (and any after `max`) are greyed out.
// onWeekday (Find a day, 31 Oct): the weekday letters become buttons that hand back every
// selectable day of that weekday in the month showing, so "every Saturday" is one tap.
export function Calendar({
  selected,
  onPress,
  start,
  max,
  onWeekday,
}: {
  selected: string[];
  onPress: (day: string) => void;
  start?: string;
  max?: string;
  onWeekday?: (days: string[]) => void;
}) {
  const first = parseYmd(start ?? selected[0] ?? todayYmd());
  const [month, setMonth] = useState(new Date(first.getFullYear(), first.getMonth(), 1));
  const today = todayYmd();
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const thisMonth = new Date();
  const canBack = y > thisMonth.getFullYear() || (y === thisMonth.getFullYear() && m > thisMonth.getMonth());
  const canForward = !max || ymd(new Date(y, m + 1, 1)) <= max;
  const open = (day: string) => day >= today && (!max || day <= max);

  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(ymd(new Date(y, m, d)));

  return (
    <View style={styles.cal}>
      <View style={styles.head}>
        <Pressable onPress={() => canBack && setMonth(new Date(y, m - 1, 1))} hitSlop={12} disabled={!canBack} accessibilityLabel="Previous month">
          <Text style={[styles.arrow, !canBack && { opacity: 0.3 }]}>‹</Text>
        </Pressable>
        <Text style={styles.month}>
          {MONTHS[m]} {y}
        </Text>
        <Pressable onPress={() => canForward && setMonth(new Date(y, m + 1, 1))} hitSlop={12} disabled={!canForward} accessibilityLabel="Next month">
          <Text style={[styles.arrow, !canForward && { opacity: 0.3 }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) =>
          onWeekday ? (
            <Pressable
              key={i}
              style={[styles.cell, { aspectRatio: 2 }]}
              accessibilityRole="button"
              accessibilityLabel={`Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} this month`}
              onPress={() => onWeekday(cells.filter((c): c is string => !!c && parseYmd(c).getDay() === i && open(c)))}>
              <Text style={[styles.dow, styles.dowTap]}>{d}</Text>
            </Pressable>
          ) : (
            <Text key={i} style={[styles.cell, styles.dow]}>
              {d}
            </Text>
          )
        )}
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={styles.cell} />;
          const past = !open(day);
          const on = selected.includes(day);
          return (
            <Pressable
              key={day}
              disabled={past}
              onPress={() => onPress(day)}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: past }}>
              <View style={[styles.day, on && styles.dayOn]}>
                <Text style={[styles.dayText, past && styles.past, on && styles.dayTextOn]}>{Number(day.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cal: { backgroundColor: colors.card, ...border, ...shadow.card, padding: 12, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6 },
  arrow: { fontSize: 26, fontWeight: '800', paddingHorizontal: 8 },
  month: { fontSize: 16, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dow: { color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center', textAlignVertical: 'center', aspectRatio: 2 },
  day: { width: '82%', aspectRatio: 1, borderRadius: 4, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.butter, borderColor: colors.ink },
  dayText: { fontSize: 15 },
  dayTextOn: { fontWeight: '800' },
  past: { color: '#8FA3BF' },
  dowTap: { color: colors.ink, fontWeight: '800', textDecorationLine: 'underline' },
});
