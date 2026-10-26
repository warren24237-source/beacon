import { describe, expect, it } from '@jest/globals';

import { activityPhrase, dayLabel, fmtRange, fmtTime, halfHourSlots, presetWindows, upcomingDays, whenLabel } from '../time';

// Monday 26 Oct 2026, 4:10pm local time.
const now = new Date(2026, 9, 26, 16, 10);
const on = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

describe('times', () => {
  it('drops :00 and keeps minutes otherwise', () => {
    expect(fmtTime(on(26, 19))).toBe('7pm');
    expect(fmtTime(on(26, 9, 30))).toBe('9:30am');
    expect(fmtTime(on(26, 0))).toBe('12am');
    expect(fmtRange(on(26, 12), on(26, 14))).toBe('12pm to 2pm');
  });
});

describe('days', () => {
  it('offers today and the next six days', () => {
    const d = upcomingDays(now);
    expect(d).toHaveLength(7);
    expect(d.map((x) => x.label)).toEqual(['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(d[6].sub).toBe('1 Nov');
  });
  it('labels days relative to today', () => {
    expect(dayLabel(on(26, 20), now)).toBe('Today');
    expect(dayLabel(on(27, 9), now)).toBe('Tomorrow');
    expect(dayLabel(on(31, 9), now)).toBe('Sat 31');
  });
});

describe('whenLabel', () => {
  it('says "Now" while a beacon is live', () => {
    expect(whenLabel(on(26, 16), on(26, 18), now)).toEqual({ text: 'Now · till 6pm', live: true });
  });
  it('says the day and time for later ones', () => {
    expect(whenLabel(on(31, 9), on(31, 12), now)).toEqual({ text: 'Sat 31 · 9am to 12pm', live: false });
  });
});

describe('time windows', () => {
  it('today: next 2 hours plus only windows that have not finished', () => {
    const ids = presetWindows(0, now).map((w) => w.id);
    expect(ids).toEqual(['now', 'afternoon', 'early', 'tonight']); // lunch (12 to 2) has gone
  });
  it('another day: morning to tonight', () => {
    expect(presetWindows(5, now).map((w) => w.label)).toEqual(['Morning', 'Lunch', 'Afternoon', 'Early evening', 'Tonight']);
  });
  it('custom times start at 7am on other days and stop before midnight', () => {
    const s = halfHourSlots(2, now);
    expect(fmtTime(s[0])).toBe('7am');
    expect(s.every((d) => d.getDate() === 28)).toBe(true);
  });
});

describe('wording', () => {
  it('lists activities naturally', () => {
    expect(activityPhrase(['Coffee'])).toBe('coffee');
    expect(activityPhrase(['Coffee', 'Drinks', 'Food'])).toBe('coffee, drinks or food');
    expect(activityPhrase(['Anything'])).toBe('anything');
  });
});
