/**
 * Deterministic fictional battalion for local review and demo deployments.
 * Matches the brief's dataset for Sun 6 Sep 2026 at 09:24 Singapore time.
 * Consumed by the UI mock adapter and by the Supabase seed script.
 */
import { addDays, sgLocalToIso, type IsoDate, type IsoTimestamp } from '../dates';
import type { AbsenceStatus, OthersSubType } from '../statuses';
import type { NotificationType, Role, UnitDto, UnitId } from '../types';
import { contentHash, toSnapshot, type SnapshotEntry } from '../domain/canonical';
import { effectiveStatuses, type RollPerson, type SpanRow } from '../domain/effectiveStatus';
import { unitCounts } from '../domain/counts';
import { CHINESE_GIVEN, CHINESE_SURNAMES, INDIAN_FAMILY, INDIAN_GIVEN, MALAY_FATHER, MALAY_GIVEN, OTHER_NAMES } from './names';
import { Prng } from './prng';

export const DEMO_DATE: IsoDate = '2026-09-06';
export const DEMO_NOW: IsoTimestamp = sgLocalToIso(DEMO_DATE, '09:24');
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_EMAIL_DOMAIN = 'parade-state.demo';

export const DEMO_UNITS: UnitDto[] = [
  { id: 'S1', name: 'S1', sortOrder: 1 },
  { id: 'S2', name: 'S2', sortOrder: 2 },
  { id: 'S3', name: 'S3', sortOrder: 3 },
  { id: 'S4', name: 'S4', sortOrder: 4 },
  { id: 'SSP', name: 'SSP', sortOrder: 5 },
  { id: 'COY1', name: 'Coy 1', sortOrder: 6 },
  { id: 'COY2', name: 'Coy 2', sortOrder: 7 },
  { id: 'ISR', name: 'ISR Coy', sortOrder: 8 },
];

interface UnitSpec {
  id: UnitId;
  strength: number;
  mc: number;
  ll: number;
  ma: number;
  rsi: number;
  others: number;
  kind: 'staff' | 'support' | 'company';
}

const UNIT_SPECS: UnitSpec[] = [
  { id: 'S1', strength: 12, mc: 1, ll: 1, ma: 0, rsi: 0, others: 0, kind: 'staff' },
  { id: 'S2', strength: 14, mc: 0, ll: 0, ma: 0, rsi: 0, others: 0, kind: 'staff' },
  { id: 'S3', strength: 16, mc: 1, ll: 0, ma: 0, rsi: 0, others: 0, kind: 'staff' },
  { id: 'S4', strength: 18, mc: 0, ll: 0, ma: 1, rsi: 0, others: 0, kind: 'staff' },
  { id: 'SSP', strength: 24, mc: 0, ll: 0, ma: 0, rsi: 1, others: 1, kind: 'support' },
  { id: 'COY1', strength: 102, mc: 2, ll: 1, ma: 1, rsi: 1, others: 1, kind: 'company' },
  { id: 'COY2', strength: 96, mc: 3, ll: 2, ma: 1, rsi: 1, others: 1, kind: 'company' },
  { id: 'ISR', strength: 30, mc: 2, ll: 1, ma: 1, rsi: 0, others: 1, kind: 'company' },
];

export interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  unitId: UnitId | null;
}

export interface DemoPerson extends RollPerson {
  unitId: UnitId;
  serviceNo: string | null;
}

export interface DemoSpan extends SpanRow {
  unitId: UnitId;
  createdBy: string;
}

export interface DemoEvent {
  id: string;
  date: IsoDate;
  type: 'AM' | 'PM';
  cutoffAt: IsoTimestamp;
}

export interface DemoMark {
  eventId: string;
  personId: string;
  unitId: UnitId;
  markedBy: string;
  markedAt: IsoTimestamp;
}

export interface DemoUnitEventState {
  unitId: UnitId;
  eventId: string;
  firstChangedAt: IsoTimestamp;
  lastChangedAt: IsoTimestamp;
  lastChangedBy: string;
}

export interface DemoSubmission {
  id: string;
  unitId: UnitId;
  eventId: string;
  version: number;
  submittedBy: string;
  submittedAt: IsoTimestamp;
  contentHash: string;
  counts: ReturnType<typeof unitCounts>;
  snapshot: SnapshotEntry[];
}

export interface DemoNotification {
  id: string;
  userId: string;
  type: NotificationType;
  unitId: UnitId;
  eventId: string;
  submissionId: string | null;
  message: string;
  createdAt: IsoTimestamp;
  readAt: IsoTimestamp | null;
}

export interface DemoDataset {
  date: IsoDate;
  now: IsoTimestamp;
  units: UnitDto[];
  users: DemoUser[];
  personnel: DemoPerson[];
  events: DemoEvent[];
  spans: DemoSpan[];
  marks: DemoMark[];
  unitEventState: DemoUnitEventState[];
  submissions: DemoSubmission[];
  notifications: DemoNotification[];
}

function rankPlan(kind: UnitSpec['kind'], strength: number, rng: Prng): string[] {
  const ranks: string[] = [];
  const push = (rank: string, n: number) => { for (let i = 0; i < n; i++) ranks.push(rank); };
  if (kind === 'staff') {
    push('MAJ', 1); push('CPT', 1); push('LTA', 1); push('ME3', 1); push('ME2', 1); push('1SG', 1); push('SSG', 1); push('3SG', 2);
  } else if (kind === 'support') {
    push('CPT', 1); push('LTA', 1); push('2WO', 1); push('ME3', 1); push('ME2', 2); push('ME1', 1); push('1SG', 1); push('3SG', 4); push('CPL', 4);
  } else {
    push('CPT', 1); push('LTA', 1); push('2LT', Math.max(1, Math.round(strength / 34))); push('2WO', 1); push('1SG', 1);
    push('2SG', Math.round(strength / 25)); push('3SG', Math.round(strength / 10)); push('CFC', Math.round(strength / 30)); push('CPL', Math.round(strength / 6));
  }
  while (ranks.length < strength) {
    const r = rng.next();
    ranks.push(kind === 'staff' ? (r < 0.5 ? 'CPL' : 'LCP') : r < 0.35 ? 'LCP' : 'PTE');
  }
  return ranks.slice(0, strength);
}

function randomName(rng: Prng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const r = rng.next();
    let name: string;
    if (r < 0.74) name = `${rng.pick(CHINESE_GIVEN)} ${rng.pick(CHINESE_SURNAMES)}`;
    else if (r < 0.87) name = `${rng.pick(MALAY_GIVEN)} bin ${rng.pick(MALAY_FATHER)}`;
    else if (r < 0.96) name = `${rng.pick(INDIAN_GIVEN)} ${rng.pick(INDIAN_FAMILY)}`;
    else name = rng.pick(OTHER_NAMES);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `${rng.pick(CHINESE_GIVEN)} ${rng.pick(CHINESE_SURNAMES)} ${rng.int(2, 9)}`;
  used.add(fallback);
  return fallback;
}

const OTHERS_REMARKS: Record<OthersSubType, string[]> = {
  COURSE: ['Section Leader Course, Pasir Laba', 'Signals Course, Stagmont', 'Medic Course, Nee Soon'],
  OUTFIELD: ['Bn exercise, Area D', 'Live firing, Pulau Tekong'],
  ATTACHED_OUT: ['Attached to Bde HQ', 'Attached to 3 Div Signals'],
  DUTY: ['Guard duty, main gate', 'Camp duty'],
};

/** Build the whole fictional battalion. Async because submission hashes use WebCrypto. */
export async function buildDemoDataset(): Promise<DemoDataset> {
  const rng = new Prng(20260906);
  const date = DEMO_DATE;
  const usedNames = new Set<string>();

  const users: DemoUser[] = [
    { id: rng.uuid(), email: `s1admin@${DEMO_EMAIL_DOMAIN}`, displayName: 'CPT Ong Li Ting', role: 'ADMIN', unitId: null },
  ];
  const commanderFor = new Map<UnitId, DemoUser>();
  for (const u of DEMO_UNITS) {
    const user: DemoUser = {
      id: rng.uuid(),
      email: `cdr.${u.id.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
      displayName: `${u.name} commander`,
      role: 'COMMANDER',
      unitId: u.id,
    };
    users.push(user);
    commanderFor.set(u.id, user);
  }
  const admin = users[0]!;

  const events: DemoEvent[] = [
    { id: `${date}-AM`, date, type: 'AM', cutoffAt: sgLocalToIso(date, '10:00') },
    { id: `${date}-PM`, date, type: 'PM', cutoffAt: sgLocalToIso(date, '14:00') },
  ];
  const am = events[0]!;

  const personnel: DemoPerson[] = [];
  const spans: DemoSpan[] = [];
  const marks: DemoMark[] = [];
  const unitEventState: DemoUnitEventState[] = [];
  const submissions: DemoSubmission[] = [];
  const notifications: DemoNotification[] = [];

  // Fixed rows from the brief, all in Coy 1.
  const fixedCoy1: { rank: string; name: string; absence?: { status: AbsenceStatus; subType?: OthersSubType; start: IsoDate; end: IsoDate | null; remark?: string } }[] = [
    { rank: 'CPL', name: 'Daniel Tan', absence: { status: 'MC', start: addDays(date, -1), end: addDays(date, 2), remark: 'Fever, Bedok Polyclinic' } },
    { rank: 'LCP', name: 'Amir Rahman' },
    { rank: '3SG', name: 'Ryan Lim' },
    { rank: 'PTE', name: 'Ethan Goh', absence: { status: 'OTHERS', subType: 'COURSE', start: addDays(date, -5), end: addDays(date, 5), remark: 'Section Leader Course, Pasir Laba' } },
    { rank: 'CPL', name: 'Marcus Lee', absence: { status: 'LL', start: addDays(date, -2), end: addDays(date, 3), remark: 'Ankle sprain, excuse RMJ' } },
  ];
  for (const f of fixedCoy1) usedNames.add(f.name);

  for (const spec of UNIT_SPECS) {
    const commander = commanderFor.get(spec.id)!;
    const ranks = rankPlan(spec.kind, spec.strength, rng);
    const unitPeople: DemoPerson[] = [];
    const fixed = spec.id === 'COY1' ? fixedCoy1 : [];
    // Replace matching rank slots with the fixed rows so counts stay exact.
    const rankPool = [...ranks];
    for (const f of fixed) {
      const idx = rankPool.indexOf(f.rank);
      if (idx >= 0) rankPool.splice(idx, 1);
      else rankPool.pop();
    }
    for (const f of fixed) {
      unitPeople.push({ id: rng.uuid(), unitId: spec.id, rank: f.rank, name: f.name, serviceNo: null, postedInDate: addDays(date, -rng.int(60, 700)), postedOutDate: null });
    }
    for (const rank of rankPool) {
      unitPeople.push({ id: rng.uuid(), unitId: spec.id, rank, name: randomName(rng, usedNames), serviceNo: null, postedInDate: addDays(date, -rng.int(30, 900)), postedOutDate: null });
    }
    personnel.push(...unitPeople);

    // Absences: fixed ones first, then fill the remaining quota from the unit's enlistees.
    const absentIds = new Set<string>();
    const remaining = { mc: spec.mc, ll: spec.ll, ma: spec.ma, rsi: spec.rsi, others: spec.others };
    const addSpan = (person: DemoPerson, status: AbsenceStatus, subType: OthersSubType | null, start: IsoDate, end: IsoDate | null, remark: string | null) => {
      spans.push({
        id: rng.uuid(), personId: person.id, unitId: spec.id, status, subType, startDate: start, endDate: end, remark,
        createdAt: sgLocalToIso(start < date ? start : date, `0${rng.int(6, 8)}:${String(rng.int(10, 59))}`),
        createdBy: commander.id,
      });
      absentIds.add(person.id);
    };
    for (const f of fixed) {
      if (!f.absence) continue;
      const person = unitPeople.find((p) => p.name === f.name)!;
      addSpan(person, f.absence.status, f.absence.subType ?? null, f.absence.start, f.absence.end, f.absence.remark ?? null);
      const key = f.absence.status.toLowerCase() as keyof typeof remaining;
      remaining[key] -= 1;
    }
    const candidates = rng.shuffle(unitPeople.filter((p) => !absentIds.has(p.id) && ['PTE', 'LCP', 'CPL', 'CFC', '3SG'].includes(p.rank)));
    let ci = 0;
    const take = () => { const p = candidates[ci++]; if (!p) throw new Error(`not enough candidates in ${spec.id}`); return p; };
    for (let i = 0; i < remaining.mc; i++) addSpan(take(), 'MC', null, addDays(date, -rng.int(0, 2)), addDays(date, rng.int(1, 3)), rng.pick(['Fever, Bedok Polyclinic', 'URTI, medical centre', 'Gastroenteritis, CGH', 'Flu, Tampines Polyclinic']));
    for (let i = 0; i < remaining.ll; i++) addSpan(take(), 'LL', null, addDays(date, -rng.int(0, 3)), addDays(date, rng.int(2, 6)), rng.pick(['Excuse RMJ', 'Excuse boots', 'Excuse heavy load']));
    for (let i = 0; i < remaining.ma; i++) addSpan(take(), 'MA', null, date, date, rng.pick(['CGH 14:00', 'NUH 09:30', 'Dental, medical centre']));
    for (let i = 0; i < remaining.rsi; i++) addSpan(take(), 'RSI', null, date, date, null);
    for (let i = 0; i < remaining.others; i++) {
      const subType = rng.pick(['COURSE', 'OUTFIELD', 'ATTACHED_OUT', 'DUTY'] as const);
      addSpan(take(), 'OTHERS', subType, addDays(date, -rng.int(0, 6)), addDays(date, rng.int(3, 14)), rng.pick(OTHERS_REMARKS[subType]));
    }

    // Confirmed Present marks for the AM parade.
    const presentPeople = unitPeople.filter((p) => !absentIds.has(p.id));
    const confirmShare = spec.id === 'S2' ? 0 : spec.id === 'COY1' ? 0.6 : 0.97;
    for (const p of presentPeople) {
      if (rng.next() < confirmShare) {
        marks.push({ eventId: am.id, personId: p.id, unitId: spec.id, markedBy: commander.id, markedAt: sgLocalToIso(date, `0${rng.int(7, 8)}:${String(rng.int(10, 59))}`) });
      }
    }
  }

  // Submission and activity states at 09:24.
  const submitTimes: Partial<Record<UnitId, string[]>> = {
    S1: ['08:22'], S3: ['08:31'], S4: ['08:45'], SSP: ['08:40', '09:10'], COY2: ['09:02'], ISR: ['08:58'],
  };
  const notifyAdmins = (type: NotificationType, unit: UnitDto, submissionId: string | null, message: string, at: IsoTimestamp, read: boolean) => {
    notifications.push({ id: rng.uuid(), userId: admin.id, type, unitId: unit.id, eventId: am.id, submissionId, message, createdAt: at, readAt: read ? at : null });
  };

  for (const unit of DEMO_UNITS) {
    const commander = commanderFor.get(unit.id)!;
    const unitPeople = personnel.filter((p) => p.unitId === unit.id);
    const unitSpans = spans.filter((s) => s.unitId === unit.id);
    const unitMarks = new Set(marks.filter((m) => m.unitId === unit.id && m.eventId === am.id).map((m) => m.personId));
    const statuses = effectiveStatuses(unitPeople, unitSpans, unitMarks, date);
    const counts = unitCounts(statuses);
    const hash = await contentHash(statuses);
    const times = submitTimes[unit.id];

    if (unit.id === 'S2') continue; // Not marked, no activity.

    const markTimes = marks.filter((m) => m.unitId === unit.id).map((m) => m.markedAt).sort();
    const first = markTimes[0] ?? sgLocalToIso(date, '07:30');
    const last = unit.id === 'COY1' ? sgLocalToIso(date, '09:21') : (markTimes[markTimes.length - 1] ?? first);
    unitEventState.push({ unitId: unit.id, eventId: am.id, firstChangedAt: first, lastChangedAt: last, lastChangedBy: commander.id });

    if (!times) continue; // Coy 1: pending.
    times.forEach((t, i) => {
      const version = i + 1;
      const submittedAt = sgLocalToIso(date, t);
      const isLatest = i === times.length - 1;
      const sub: DemoSubmission = {
        id: rng.uuid(), unitId: unit.id, eventId: am.id, version, submittedBy: commander.id, submittedAt,
        // Earlier versions carry a different hash so the latest one matches the current state.
        contentHash: isLatest ? hash : `${hash.slice(0, 60)}v${version}`,
        counts: isLatest ? counts : { ...counts, present: counts.present + 1, rsi: Math.max(0, counts.rsi - 1), absent: counts.absent - 1 },
        snapshot: toSnapshot(statuses),
      };
      submissions.push(sub);
      const label = version === 1 ? 'submitted' : `resubmitted (v${version})`;
      const isUnread = ['09:02', '09:10', '08:58'].includes(t);
      notifyAdmins(version === 1 ? 'SUBMITTED' : 'RESUBMITTED', unit, sub.id, `${unit.name} ${label} AM parade · ${sub.counts.present}/${sub.counts.strength} present`, submittedAt, !isUnread);
    });
  }
  notifications.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { date, now: DEMO_NOW, units: DEMO_UNITS, users, personnel, events, spans, marks, unitEventState, submissions, notifications };
}
