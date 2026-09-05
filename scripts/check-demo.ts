/** Prints the demo battalion's per-unit counts so they can be checked against the brief. */
import { buildDemoDataset } from '../src/shared/demo/dataset';
import { effectiveStatuses, sumCounts, unitCounts } from '../src/shared/domain';

const d = await buildDemoDataset();
const rows = d.units.map((u) => {
  const people = d.personnel.filter((p) => p.unitId === u.id);
  const spans = d.spans.filter((s) => s.unitId === u.id);
  const marks = new Set(d.marks.filter((m) => m.unitId === u.id).map((m) => m.personId));
  const c = unitCounts(effectiveStatuses(people, spans, marks, d.date));
  return { unit: u.name, ...c, subs: d.submissions.filter((s) => s.unitId === u.id).length };
});
console.table(rows);
console.log('totals', sumCounts(rows.map(({ unit: _u, subs: _s, ...c }) => c)));
console.log('notifications', d.notifications.length, 'unread', d.notifications.filter((n) => !n.readAt).length);
console.log('coy1 fixed', d.personnel.filter((p) => ['Daniel Tan', 'Amir Rahman', 'Ryan Lim', 'Ethan Goh', 'Marcus Lee'].includes(p.name)).map((p) => `${p.rank} ${p.name}`));
console.log('names unique', new Set(d.personnel.map((p) => p.name)).size, 'of', d.personnel.length);
