/**
 * Monthly Excel export for S1: every parade of the month as submitted, one workbook.
 * Pure: the Worker feeds it rows from Postgres, the mock feeds it the demo battalion.
 */
import { addDays, formatSgDateLong, formatSgDateMedium, formatSgTime, type IsoDate, type IsoTimestamp } from '../dates';
import type { SnapshotEntry } from '../domain/canonical';
import { normalizeCounts } from '../domain/counts';
import { STATUS_COUNT_KEY } from '../domain/insights';
import { ABSENCE_STATUSES, isAbsenceStatus, STATUS_LABEL, statusLabel, SUB_TYPE_LABEL } from '../statuses';
import type { EventType, UnitCounts } from '../types';
import { buildXlsx, type Cell } from './xlsx';

export interface MonthlyUnit { id: string; name: string; sortOrder: number }
export interface MonthlyEvent { id: string; date: IsoDate; type: EventType; label: string; cutoffAt: IsoTimestamp | null; createdAt: IsoTimestamp }
export interface MonthlySubmission { unitId: string; eventId: string; version: number; submittedAt: IsoTimestamp; counts: Partial<UnitCounts>; snapshot: SnapshotEntry[] }

export interface MonthlyInput {
  /** 'YYYY-MM' */
  month: string;
  units: MonthlyUnit[];
  /** Every event dated in the month, archived ad hoc events included. */
  events: MonthlyEvent[];
  /** The latest submission per unit and event. */
  submissions: MonthlySubmission[];
  generatedAt: Date;
}

const TYPE_ORDER: Record<EventType, number> = { AM: 0, PM: 1, ROLLCALL: 2, ADHOC: 3 };

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Every civil date of the month, oldest first. */
export function monthDates(month: string): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d: IsoDate = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthLabel(month: string): string {
  return formatSgDateMedium(`${month}-01`).slice(2);
}

function stateText(s: MonthlySubmission, cutoffAt: IsoTimestamp | null): string {
  const late = cutoffAt !== null && Date.parse(s.submittedAt) > Date.parse(cutoffAt);
  const base = s.version === 1 ? 'Submitted' : `Resubmitted v${s.version}`;
  return late ? `${base} (late)` : base;
}

export interface MonthlySheets { byDay: Cell[][]; byUnit: Cell[][]; absentees: Cell[][] }

export function monthlyRows(input: MonthlyInput): MonthlySheets {
  const units = [...input.units].sort((a, b) => a.sortOrder - b.sortOrder);
  const latest = new Map<string, MonthlySubmission>();
  for (const s of input.submissions) {
    const key = `${s.unitId}|${s.eventId}`;
    const cur = latest.get(key);
    if (!cur || s.version > cur.version) latest.set(key, s);
  }
  const submittedEventIds = new Set(input.submissions.map((s) => s.eventId));
  const eventsByDate = new Map<IsoDate, MonthlyEvent[]>();
  for (const e of input.events) {
    // The AM and PM parades always appear; the optional Roll Call and ad hoc events only once someone submitted them.
    if (!(e.type === 'AM' || e.type === 'PM' || submittedEventIds.has(e.id))) continue;
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }

  const absenceHeader = ABSENCE_STATUSES.map((s) => STATUS_LABEL[s]);
  const absenceCells = (c: UnitCounts): Cell[] => ABSENCE_STATUSES.map((s) => c[STATUS_COUNT_KEY[s]]);
  const title = `15C4I Battalion parade states · ${monthLabel(input.month)}`;
  const generated = `Generated ${formatSgDateLong(input.generatedAt.toISOString().slice(0, 10))} ${formatSgTime(input.generatedAt)} · figures as submitted by each Branch/Coy`;

  const byDay: Cell[][] = [[title], [generated], [], ['Date', 'Event', 'Submitted', 'Strength', 'Present', 'Present %', 'Absent', ...absenceHeader, 'Unmarked']];
  const byUnit: Cell[][] = [[title], [generated], [], ['Date', 'Event', 'Branch/Coy', 'Strength', 'Present', 'Absent', ...absenceHeader, 'Unmarked', 'Status', 'Submitted at']];
  const absentees: Cell[][] = [['Date', 'Event', 'Branch/Coy', 'Rank', 'Name', 'Status', 'Sub-type', 'Start', 'End', 'Remark']];

  for (const date of monthDates(input.month)) {
    const events = (eventsByDate.get(date) ?? []).sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.createdAt.localeCompare(b.createdAt));
    for (const ev of events) {
      const total = { ...normalizeCounts({}) };
      let submitted = 0;
      for (const u of units) {
        const s = latest.get(`${u.id}|${ev.id}`);
        if (!s) {
          byUnit.push([date, ev.label, u.name, null, null, null, ...ABSENCE_STATUSES.map(() => null), null, 'Not submitted', '']);
          continue;
        }
        submitted += 1;
        const c = normalizeCounts(s.counts);
        for (const key of Object.keys(total) as (keyof UnitCounts)[]) total[key] += c[key];
        byUnit.push([date, ev.label, u.name, c.strength, c.present, c.absent, ...absenceCells(c), c.unmarked, stateText(s, ev.cutoffAt), formatSgTime(s.submittedAt)]);
        for (const entry of s.snapshot) {
          if (!isAbsenceStatus(entry.status)) continue;
          absentees.push([
            date, ev.label, u.name, entry.rank, entry.name, statusLabel(entry.status, entry.halfDay ?? null),
            entry.subType ? SUB_TYPE_LABEL[entry.subType] : '', entry.startDate ?? '', entry.endDate ?? '', entry.remark ?? '',
          ]);
        }
      }
      const rate = total.strength > 0 ? `${((total.present / total.strength) * 100).toFixed(1)}%` : '';
      byDay.push([date, ev.label, `${submitted} of ${units.length}`, total.strength, total.present, rate, total.absent, ...absenceCells(total), total.unmarked]);
    }
  }
  return { byDay, byUnit, absentees };
}

export function monthlyXlsx(input: MonthlyInput): Uint8Array {
  const { byDay, byUnit, absentees } = monthlyRows(input);
  const n = ABSENCE_STATUSES.length;
  return buildXlsx([
    { name: 'Battalion by day', rows: byDay, boldRows: [0, 3], columnWidths: [12, 14, 12, 10, 10, 10, 8, ...Array<number>(n).fill(7), 10] },
    { name: 'Branches by day', rows: byUnit, boldRows: [0, 3], columnWidths: [12, 14, 14, 10, 10, 8, ...Array<number>(n).fill(7), 10, 22, 12] },
    { name: 'Absentees', rows: absentees, boldRows: [0], columnWidths: [12, 14, 12, 8, 28, 10, 14, 12, 12, 40] },
  ]);
}
