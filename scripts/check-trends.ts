/** Prints the demo battalion's 14-day trend and reporting discipline as the trends API sees it. */
import { buildDemoDataset } from '../src/shared/demo/dataset';
import { buildBriefing, buildTrends, effectiveStatuses, pct, platoonBreakdown, rateOf, sumCounts, trendDates, unitCounts } from '../src/shared/domain';
import type { UnitSummaryRow } from '../src/shared/types';

const d = await buildDemoDataset();
const event = d.events.find((e) => e.id === `${d.date}-AM`)!;
const eventDto = { ...event, name: null, label: 'AM parade', archivedAt: null } as const;
const rows: UnitSummaryRow[] = d.units.map((u) => {
  const people = d.personnel.filter((p) => p.unitId === u.id);
  const spans = d.spans.filter((s) => s.unitId === u.id);
  const marks = new Set(d.marks.filter((m) => m.unitId === u.id && m.eventId === event.id).map((m) => m.personId));
  const statuses = effectiveStatuses(people, spans, marks, d.date);
  const subs = d.submissions.filter((s) => s.unitId === u.id && s.eventId === event.id).sort((a, b) => b.version - a.version);
  const sub = subs[0];
  const unit = { ...u, platoons: d.platoons.filter((p) => p.unitId === u.id) };
  return {
    unit, counts: unitCounts(statuses), platoons: platoonBreakdown(statuses, unit.platoons),
    submission: sub ? { kind: sub.version > 1 ? 'RESUBMITTED' : 'SUBMITTED', version: sub.version, submittedAt: sub.submittedAt, submittedBy: sub.submittedBy, wasLate: false, hasChanges: false } : { kind: 'NOT_MARKED' },
  };
});
const pastDates = new Set(trendDates(d.date, 14).filter((x) => x !== d.date));
const t = buildTrends({
  event: eventDto, days: 14,
  units: d.units.map((u) => ({ id: u.id, name: u.name, sortOrder: u.sortOrder })),
  pastEvents: d.events.filter((e) => e.type === 'AM' && pastDates.has(e.date)).map((e) => ({ id: e.id, date: e.date, cutoffAt: e.cutoffAt })),
  submissions: d.submissions.map((s) => ({ unitId: s.unitId, eventId: s.eventId, submittedAt: s.submittedAt, counts: s.counts })),
  today: { units: rows, totals: sumCounts(rows.map((r) => r.counts)), unitsSubmitted: rows.filter((r) => r.submission.kind !== 'NOT_MARKED').length, unitsTotal: rows.length },
  todayStatuses: d.units.flatMap((u) => effectiveStatuses(d.personnel.filter((p) => p.unitId === u.id), d.spans.filter((s) => s.unitId === u.id), new Set(d.marks.filter((m) => m.unitId === u.id && m.eventId === event.id).map((m) => m.personId)), d.date)),
  serverNow: d.now,
});
console.table(t.days.map((x) => ({ date: x.date, live: x.live, strength: x.counts.strength, present: x.counts.present, rate: pct(rateOf(x.counts), 1), absent: x.counts.absent, unmarked: x.counts.unmarked, mc: x.counts.mc, ll: x.counts.ll, ma: x.counts.ma, rsi: x.counts.rsi, oth: x.counts.others, subs: x.unitsSubmitted, onTime: x.onTime, late: x.late })));
console.table(t.units);
console.log('others sub-types', t.othersSubTypes);
const b = buildBriefing(t, { units: rows });
console.log('HEADLINE', b.headline);
for (const i of b.items) console.log(`- [${i.tone}] ${i.text}`);
console.log('events', d.events.length, 'spans', d.spans.length, 'marks', d.marks.length, 'submissions', d.submissions.length);
