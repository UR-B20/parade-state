import { describe, expect, it } from 'vitest';
import { awaitingRank, deriveSubmissionState, isDateLocked } from '@shared/domain';

const cutoffAt = '2026-09-06T02:00:00.000Z'; // 10:00 SGT
const before = new Date('2026-09-06T01:24:00.000Z');
const after = new Date('2026-09-06T02:05:00.000Z');
const latest = { version: 1, submittedAt: '2026-09-06T00:22:00.000Z', submittedBy: 'u', contentHash: 'h1' };

describe('deriveSubmissionState', () => {
  it('is Not marked with no activity before cut-off', () => {
    expect(deriveSubmissionState({ latest: null, activity: null, cutoffAt, now: before, currentHash: 'h' })).toEqual({ kind: 'NOT_MARKED' });
  });

  it('is Pending with activity before cut-off', () => {
    expect(deriveSubmissionState({ latest: null, activity: { lastChangedAt: 'x' }, cutoffAt, now: before, currentHash: 'h' })).toEqual({ kind: 'PENDING', lastChangedAt: 'x' });
  });

  it('is Late without a submission after cut-off, whatever the activity', () => {
    expect(deriveSubmissionState({ latest: null, activity: null, cutoffAt, now: after, currentHash: 'h' })).toMatchObject({ kind: 'LATE', hasActivity: false });
    expect(deriveSubmissionState({ latest: null, activity: { lastChangedAt: 'x' }, cutoffAt, now: after, currentHash: 'h' })).toMatchObject({ kind: 'LATE', hasActivity: true });
  });

  it('is Submitted for v1 and Resubmitted for later versions, with change detection', () => {
    expect(deriveSubmissionState({ latest, activity: null, cutoffAt, now: after, currentHash: 'h1' })).toMatchObject({ kind: 'SUBMITTED', hasChanges: false, wasLate: false });
    expect(deriveSubmissionState({ latest, activity: null, cutoffAt, now: after, currentHash: 'h2' })).toMatchObject({ kind: 'SUBMITTED', hasChanges: true });
    expect(deriveSubmissionState({ latest: { ...latest, version: 2 }, activity: null, cutoffAt, now: before, currentHash: 'h1' })).toMatchObject({ kind: 'RESUBMITTED', version: 2 });
  });

  it('flags a submission made after cut-off', () => {
    expect(deriveSubmissionState({ latest: { ...latest, submittedAt: '2026-09-06T02:14:00.000Z' }, activity: null, cutoffAt, now: after, currentHash: 'h1' })).toMatchObject({ wasLate: true });
  });

  it('ranks awaiting units Late, Pending, Not marked', () => {
    expect(awaitingRank({ kind: 'LATE', hasActivity: false, lastChangedAt: null })).toBeLessThan(awaitingRank({ kind: 'PENDING', lastChangedAt: 'x' }));
    expect(awaitingRank({ kind: 'PENDING', lastChangedAt: 'x' })).toBeLessThan(awaitingRank({ kind: 'NOT_MARKED' }));
  });
});

describe('isDateLocked', () => {
  const now = new Date('2026-09-06T01:00:00.000Z');
  it('never locks today or the future', () => {
    expect(isDateLocked('2026-09-06', '2026-09-06', [], now)).toBe(false);
    expect(isDateLocked('2026-09-07', '2026-09-06', [], now)).toBe(false);
  });
  it('locks the past unless an unexpired unlock exists', () => {
    expect(isDateLocked('2026-09-05', '2026-09-06', [], now)).toBe(true);
    expect(isDateLocked('2026-09-05', '2026-09-06', [{ date: '2026-09-05', expiresAt: '2026-09-06T02:00:00.000Z' }], now)).toBe(false);
    expect(isDateLocked('2026-09-05', '2026-09-06', [{ date: '2026-09-05', expiresAt: '2026-09-06T00:00:00.000Z' }], now)).toBe(true);
    expect(isDateLocked('2026-09-04', '2026-09-06', [{ date: '2026-09-05', expiresAt: '2026-09-06T02:00:00.000Z' }], now)).toBe(true);
  });
});
