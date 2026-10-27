import { describe, expect, it } from '@jest/globals';

import { joinNames, sentToLine, whosInLine } from '../words';

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
