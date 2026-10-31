import { describe, expect, it } from '@jest/globals';

import { activityOptions, activityPhrase, beaconPreview, cleanActivity, dayLabel, fmtRange, fmtTime, halfHourSlots, presetWindows, upcomingDays, whenLabel } from '../time';

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
  it('today at 4:10pm: next 2 hours, then blocks from the next half hour', () => {
    const w = presetWindows(0, now);
    expect(w.map((x) => x.id)).toEqual(['now', 'late-afternoon', 'early-evening', 'late-evening']);
    expect(fmtTime(w[1].start)).toBe('4:30pm'); // never 4:10pm
    expect(fmtTime(w[0].end)).toBe('6:30pm'); // 2 hours on, rounded up to the half hour
  });
  it('today: a block under way needs an hour left', () => {
    expect(presetWindows(0, on(26, 17, 5)).map((x) => x.id)).toEqual(['now', 'early-evening', 'late-evening']); // late afternoon would be 5:30 to 6pm
    expect(fmtTime(presetWindows(0, on(26, 13, 54))[1].start)).toBe('2pm');
  });
  it('late evening runs to midnight', () => {
    const w = presetWindows(3, now).at(-1)!;
    expect(fmtRange(w.start, w.end)).toBe('9pm to midnight');
  });
  it('another day: the six standard blocks', () => {
    expect(presetWindows(5, now).map((w) => w.label)).toEqual(['Early morning', 'Mid morning', 'Early afternoon', 'Late afternoon', 'Early evening', 'Late evening']);
  });
  it('pick times: half hours from the next half hour today, 6am other days, before midnight', () => {
    expect(fmtTime(halfHourSlots(0, on(26, 13, 54))[0])).toBe('2pm');
    expect(fmtTime(halfHourSlots(0, on(26, 13, 10))[0])).toBe('1:30pm');
    const s = halfHourSlots(2, now);
    expect(fmtTime(s[0])).toBe('6am');
    expect(s.every((d) => d.getDate() === 28 && d.getMinutes() % 30 === 0)).toBe(true);
  });
});

describe('wording', () => {
  it('lists activities naturally', () => {
    expect(activityPhrase(['Coffee'])).toBe('coffee');
    expect(activityPhrase(['Coffee', 'Drinks', 'Food'])).toBe('coffee, drinks or food');
    expect(activityPhrase(['Anything'])).toBe('anything');
  });
  it('a beacon starting now says "now till", never the current minute', () => {
    expect(beaconPreview('Warren', ['Drinks'], on(26, 16, 10), on(26, 18, 30), now)).toBe("Warren's up for drinks, now till 6:30pm");
  });
  it('previews the notification like the server words it', () => {
    expect(beaconPreview('Warren', ['Padel'], on(27, 19), on(27, 23), now)).toBe("Warren's up for padel, tomorrow, 7pm to 11pm");
    expect(beaconPreview('Warren', ['Coffee', 'Food'], on(26, 17), on(26, 19), now)).toBe("Warren's up for coffee or food, 5pm to 7pm");
    expect(beaconPreview('Warren', ['Anything'], on(31, 9), on(31, 12), now)).toBe("Warren's up for anything, Sat 31 Oct, 9am to 12pm");
  });
});

describe('what are you up for', () => {
  const STD = ['Coffee', 'Drinks', 'Food', 'Play date', 'Anything'];
  it('puts up to 3 recents first, newest first, then the rest of the standard list', () => {
    const o = activityOptions([['Padel'], ['Drinks', 'Food'], ['padel'], ['Park run'], ['Swim']], STD);
    expect(o.filter((x) => x.recent).map((x) => x.label)).toEqual(['Padel', 'Drinks', 'Food']);
    expect(o.filter((x) => !x.recent).map((x) => x.label)).toEqual(['Coffee', 'Play date', 'Anything']);
  });
  it('never lists Anything as a recent, and copes with no history', () => {
    expect(activityOptions([['Anything']], STD).every((x) => !x.recent)).toBe(true);
    expect(activityOptions([], STD).map((x) => x.label)).toEqual(STD);
  });
  it('tidies typed activities', () => {
    expect(cleanActivity('  padel   at 7 ')).toBe('Padel at 7');
    expect(cleanActivity('a very long activity name indeed')).toHaveLength(20);
    expect(cleanActivity('   ')).toBe('');
  });
});
