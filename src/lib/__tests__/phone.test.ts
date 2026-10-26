import { describe, expect, it } from '@jest/globals';

import { bestNumber, normaliseNumber } from '../phone';

describe('normaliseNumber', () => {
  it('turns UK mobiles into full international digits', () => {
    expect(normaliseNumber('07700 900123')).toBe('447700900123');
    expect(normaliseNumber('+44 7700 900123')).toBe('447700900123');
    expect(normaliseNumber('0044 7700 900123')).toBe('447700900123');
  });
  it('drops the written (0) and a stray 0 after 44', () => {
    expect(normaliseNumber('+44 (0)7700 900123')).toBe('447700900123');
    expect(normaliseNumber('+4407700900123')).toBe('447700900123');
  });
  it('keeps other countries as typed', () => {
    expect(normaliseNumber('+1 212 555 0123')).toBe('12125550123');
  });
  it('rejects things that are not numbers', () => {
    expect(normaliseNumber('123')).toBeNull();
    expect(normaliseNumber('hello')).toBeNull();
  });
});

describe('bestNumber', () => {
  it('prefers the number labelled mobile', () => {
    expect(bestNumber([{ label: 'home', number: '0115 496 0000' }, { label: 'mobile', number: '07700 900123' }])).toBe('447700900123');
  });
  it('falls back to one that looks like a UK mobile', () => {
    expect(bestNumber([{ label: 'work', number: '0115 496 0000' }, { label: 'other', number: '07700 900123' }])).toBe('447700900123');
  });
  it('uses the first valid number when nothing looks mobile', () => {
    expect(bestNumber([{ number: 'nope' }, { number: '0115 496 0000' }])).toBe('441154960000');
  });
  it('returns null with no usable numbers', () => {
    expect(bestNumber([])).toBeNull();
  });
});
