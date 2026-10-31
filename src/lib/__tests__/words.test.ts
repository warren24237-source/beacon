import { describe, expect, it } from '@jest/globals';

import { eventLine, joinNames, newCount, sentToLine, shortDay, whosInLine } from '../words';

describe('sentToLine', () => {
  it('names everyone else it went to', () => {
    expect(sentToLine(['Kat', 'Sam'], 3)).toBe('Sent to you, Kat and Sam');
    expect(sentToLine(['Kat'], 2)).toBe('Sent to you and Kat');
  });
  it('says just you when nobody else got it', () => {
    expect(sentToLine([], 1)).toBe('Sent to you');
  });
  it('falls back to the count from an older server', () => {
    expect(sentToLine(undefined, 6)).toBe('Sent to 6');
    expect(sentToLine(null, 6)).toBe('Sent to 6');
  });
  it('stops after the limit', () => {
    expect(sentToLine(['A', 'B', 'C', 'D'], 5, 2)).toBe('Sent to you, A, B and 2 others');
    expect(sentToLine(['A', 'B', 'C'], 4, 2)).toBe('Sent to you, A, B and 1 other');
  });
});

describe('whosInLine', () => {
  it('reads naturally', () => {
    expect(whosInLine([])).toBe('nobody in yet');
    expect(whosInLine(['Kat'])).toBe('Kat is in');
    expect(whosInLine(['Kat', 'Sam'])).toBe('Kat and Sam are in');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('eventLine', () => {
  it('reads naturally for each event', () => {
    expect(eventLine('in', 'Kat')).toBe("Kat's in");
    expect(eventLine('in', 'You')).toBe("You're in");
    expect(eventLine('out', 'Dan')).toBe("Dan can't make it");
    expect(eventLine('locked', 'Warren', null, 'Ye Olde Trip')).toBe('Warren locked it in at Ye Olde Trip');
    expect(eventLine('locked', 'Warren')).toBe('Warren locked it in');
    expect(eventLine('moved', 'Warren', null, "Dan's")).toBe("Warren moved it to Dan's");
    expect(eventLine('suggested', 'Sam', null, 'The Malt Cross')).toBe('Sam suggested The Malt Cross');
    expect(eventLine('changed', 'Warren', { what: 'drinks', when: 'today, 8pm to 11pm' })).toBe('Warren changed it: drinks, today, 8pm to 11pm');
    expect(eventLine('called_off', 'Warren')).toBe('Warren called it off');
    expect(eventLine('locked_day', 'Warren', { day: '2026-12-12' })).toBe('Warren locked in Sat 12 Dec');
    expect(eventLine('mystery', 'Warren')).toBe('');
  });
});

describe('newCount', () => {
  it('shows nothing, a number, or 9+', () => {
    expect(newCount(0)).toBe('');
    expect(newCount(2)).toBe('2 new');
    expect(newCount(14)).toBe('9+ new');
  });
  it('formats days', () => {
    expect(shortDay('2026-10-31')).toBe('Sat 31 Oct');
  });
});
