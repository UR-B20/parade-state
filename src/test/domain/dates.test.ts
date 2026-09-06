import { describe, expect, it } from 'vitest';
import { addDays, formatSgDateLong, formatSgDateShort, formatSgTime, isIsoDate, sgDateOf, sgLocalToIso } from '@shared/dates';

describe('Singapore dates', () => {
  it('rolls the civil date over at 16:00 UTC (00:00 SGT)', () => {
    expect(sgDateOf('2026-09-05T15:59:59.000Z')).toBe('2026-09-05');
    expect(sgDateOf('2026-09-05T16:00:00.000Z')).toBe('2026-09-06');
    expect(sgDateOf('2026-09-05T23:30:00.000Z')).toBe('2026-09-06');
  });

  it('converts local cut-off times to UTC instants', () => {
    expect(sgLocalToIso('2026-09-06', '10:00')).toBe('2026-09-06T02:00:00.000Z');
    expect(sgLocalToIso('2026-09-06', '14:00')).toBe('2026-09-06T06:00:00.000Z');
  });

  it('formats times in 24-hour Singapore time', () => {
    expect(formatSgTime('2026-09-06T01:24:00.000Z')).toBe('09:24');
    expect(formatSgTime('2026-09-05T16:05:00.000Z')).toBe('00:05');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('formats dates for display', () => {
    expect(formatSgDateLong('2026-09-06')).toBe('Sun, 6 Sep 2026');
    expect(formatSgDateShort('2026-09-08', '2026-09-06')).toBe('8 Sep');
    expect(formatSgDateShort('2027-01-02', '2026-09-06')).toBe('2 Jan 2027');
  });

  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-09-06')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('06/09/2026')).toBe(false);
  });
});
