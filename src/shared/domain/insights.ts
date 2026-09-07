import type { IsoDate } from '../dates';
import { ABSENCE_STATUSES, STATUS_LONG_LABEL, type AbsenceStatus } from '../statuses';
import type { BattalionSummaryDto, TrendDay, TrendsDto, UnitCounts } from '../types';

export type InsightTone = 'ok' | 'warn' | 'danger' | 'neutral';
export interface Insight { tone: InsightTone; text: string }

export interface Briefing {
  /** One sentence for the top of the page. */
  headline: string;
  items: Insight[];
  /** Present over strength today (null when strength is 0). */
  presentRate: number | null;
  /** Present over everyone marked today: the like-for-like figure while marking is incomplete. */
  markedRate: number | null;
  /** Mean present rate of the last 7 recorded days before today, and the 7 before those. */
  avg7: number | null;
  prevAvg7: number | null;
  /** Absent over strength, today and the 7-day mean. */
  absentRate: number | null;
  avgAbsent7: number | null;
}

export const NORM_PRESENT_RATE = 0.9;

export function rateOf(c: UnitCounts): number | null {
  return c.strength > 0 ? c.present / c.strength : null;
}

export function markedRateOf(c: UnitCounts): number | null {
  const marked = c.strength - c.unmarked;
  return marked > 0 ? c.present / marked : null;
}

export function pct(rate: number | null, digits = 0): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(digits)}%`;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

const STATUS_KEY: Record<AbsenceStatus, keyof UnitCounts> = { MC: 'mc', LL: 'll', MA: 'ma', RSI: 'rsi', OTHERS: 'others' };

export function shortDate(date: IsoDate): string {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

function compareWord(delta: number, threshold = 0.015): string {
  return delta >= threshold ? 'above' : delta <= -threshold ? 'below' : 'in line with';
}

/** Turns the trend window into the sentences an executive reads first. Pure and deterministic. */
export function buildBriefing(t: TrendsDto, summary?: Pick<BattalionSummaryDto, 'units'>): Briefing {
  const today = t.days[t.days.length - 1]!;
  const past = t.days.filter((d) => !d.live && d.unitsSubmitted > 0);
  const last7 = past.slice(-7);
  const prev7 = past.slice(-14, -7);
  const rates = (ds: TrendDay[]) => ds.map((d) => rateOf(d.counts)).filter((r): r is number => r !== null);
  const avg7 = mean(rates(last7));
  const prevAvg7 = mean(rates(prev7));
  const c = today.counts;
  const presentRate = rateOf(c);
  const markedRate = markedRateOf(c);
  const absentRate = c.strength > 0 ? c.absent / c.strength : null;
  const avgAbsent7 = mean(last7.map((d) => (d.counts.strength > 0 ? d.counts.absent / d.counts.strength : null)).filter((r): r is number => r !== null));

  const incomplete = today.unitsSubmitted < today.unitsTotal || c.unmarked > 0;
  const vsAvg = avg7 !== null && markedRate !== null ? ` That is ${compareWord(markedRate - avg7)} the 7-day average of ${pct(avg7)}.` : '';
  const headline = c.strength === 0
    ? 'No personnel on the roll yet.'
    : incomplete
      ? `${today.unitsSubmitted} of ${today.unitsTotal} Branches/Coy have submitted: ${c.present} of ${c.strength} marked present, ${c.unmarked} still to mark. Of those marked, ${pct(markedRate)} are present.${vsAvg}`
      : `All ${today.unitsTotal} Branches/Coy have submitted: ${pct(presentRate)} present (${c.present} of ${c.strength}), ${c.absent} absent.${vsAvg}`;

  const items: Insight[] = [];

  // Reporting status first: it decides whether the rest can be trusted.
  const awaiting = t.units.filter((u) => u.pending > 0).map((u) => u.unitName);
  if (awaiting.length > 0) {
    const pastCutoff = Date.parse(t.serverNow) >= Date.parse(t.event.cutoffAt);
    items.push({
      tone: pastCutoff ? 'danger' : 'warn',
      text: pastCutoff
        ? `Past the cut-off with ${awaiting.length === 1 ? 'one Branch/Coy' : `${awaiting.length} Branches/Coy`} still out: ${awaiting.join(', ')}.`
        : `Awaiting ${awaiting.join(', ')}${c.unmarked > 0 ? ` (${c.unmarked} personnel not yet marked)` : ''}.`,
    });
  }

  // Biggest absence driver, against its 7-day run rate.
  if (c.absent > 0) {
    const top = ABSENCE_STATUSES.map((s) => ({ status: s, n: c[STATUS_KEY[s]] as number })).sort((a, b) => b.n - a.n)[0]!;
    const avgTop = mean(last7.map((d) => d.counts[STATUS_KEY[top.status]] as number));
    const share = Math.round((top.n / c.absent) * 100);
    const spike = avgTop !== null && top.n >= 3 && top.n >= avgTop * 1.5;
    items.push({
      tone: spike ? 'warn' : 'neutral',
      text: `${STATUS_LONG_LABEL[top.status]} is the largest absence driver: ${top.n} of ${c.absent} absentees (${share}%)${avgTop !== null ? `, ${spike ? 'up from' : 'against'} a 7-day average of ${avgTop.toFixed(1)}` : ''}.`,
    });
  }

  // Unit outlier among units that have marked everyone (the only like-for-like comparison).
  if (summary && markedRate !== null) {
    const fully = summary.units
      .filter((u) => u.counts.strength >= 20 && u.counts.unmarked === 0)
      .map((u) => ({ name: u.unit.name, rate: u.counts.present / u.counts.strength, counts: u.counts }))
      .sort((a, b) => a.rate - b.rate);
    const lowest = fully[0];
    if (lowest && markedRate - lowest.rate >= 0.04) {
      items.push({ tone: 'warn', text: `${lowest.name} is the weakest Branch/Coy at ${pct(lowest.rate)} present (${lowest.counts.present} of ${lowest.counts.strength}), ${Math.round((markedRate - lowest.rate) * 100)} points below the battalion.` });
    } else if (fully.length >= 2) {
      items.push({ tone: 'ok', text: `No Branch/Coy is more than 4 points below the battalion rate (lowest ${lowest!.name} at ${pct(lowest!.rate)}).` });
    }
  }

  // Week-on-week trend.
  if (avg7 !== null && prevAvg7 !== null) {
    const delta = (avg7 - prevAvg7) * 100;
    items.push({
      tone: delta <= -1 ? 'warn' : delta >= 1 ? 'ok' : 'neutral',
      text: Math.abs(delta) < 1
        ? `7-day present rate steady at ${pct(avg7)}${avg7 < NORM_PRESENT_RATE ? `, below the ${pct(NORM_PRESENT_RATE)} norm` : ''}.`
        : `7-day present rate ${pct(avg7)}, ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? 'up' : 'down'} on the previous week.`,
    });
  } else if (avg7 !== null) {
    items.push({ tone: avg7 < NORM_PRESENT_RATE ? 'warn' : 'neutral', text: `7-day present rate ${pct(avg7)}${avg7 < NORM_PRESENT_RATE ? `, below the ${pct(NORM_PRESENT_RATE)} norm` : ''}.` });
  }

  // Reporting discipline over the window.
  const recorded = past.length;
  if (recorded > 0) {
    const slow = t.units.filter((u) => u.late + u.missed >= 2).sort((a, b) => b.late + b.missed - (a.late + a.missed));
    if (slow.length > 0) {
      items.push({
        tone: 'warn',
        text: `${slow.map((u) => `${u.unitName} (${u.late} late, ${u.missed} missed)`).join(', ')} over the last ${recorded} parades.`,
      });
    } else {
      items.push({ tone: 'ok', text: `Every Branch/Coy submitted on time over the last ${recorded} parades, at most one slip each.` });
    }
  }

  // The worst recorded day, if it stands out.
  if (avg7 !== null && past.length >= 3) {
    const worst = [...past].sort((a, b) => (rateOf(a.counts) ?? 1) - (rateOf(b.counts) ?? 1))[0]!;
    const worstRate = rateOf(worst.counts);
    if (worstRate !== null && avg7 - worstRate >= 0.03) {
      const wc = worst.counts;
      const topThen = ABSENCE_STATUSES.map((s) => ({ status: s, n: wc[STATUS_KEY[s]] as number })).sort((a, b) => b.n - a.n)[0]!;
      items.push({ tone: 'neutral', text: `Lowest day in the window: ${shortDate(worst.date)} at ${pct(worstRate)} present, driven by ${STATUS_LONG_LABEL[topThen.status].toLowerCase()} (${topThen.n}).` });
    }
  }

  return { headline, items: items.slice(0, 6), presentRate, markedRate, avg7, prevAvg7, absentRate, avgAbsent7 };
}
