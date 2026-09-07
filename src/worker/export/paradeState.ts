import { formatSgDateLong, formatSgTime } from '@shared/dates';
import { ABSENCE_STATUSES, STATUS_LABEL, statusLabel, SUB_TYPE_LABEL } from '@shared/statuses';
import { STATUS_COUNT_KEY } from '@shared/domain';
import type { AbsenteesDto, BattalionSummaryDto, SubmissionState } from '@shared/types';
import { toCsv } from './csv';
import { buildXlsx, type Cell } from './xlsx';

function stateText(s: SubmissionState): string {
  switch (s.kind) {
    case 'NOT_MARKED': return 'Not marked';
    case 'PENDING': return 'Pending';
    case 'LATE': return 'Late';
    case 'SUBMITTED': return s.hasChanges ? 'Submitted (changes pending)' : 'Submitted';
    case 'RESUBMITTED': return s.hasChanges ? `Resubmitted v${s.version} (changes pending)` : `Resubmitted v${s.version}`;
  }
}

function submittedAt(s: SubmissionState): string {
  return s.kind === 'SUBMITTED' || s.kind === 'RESUBMITTED' ? formatSgTime(s.submittedAt) : '';
}

export function absenteeRows(abs: AbsenteesDto): Cell[][] {
  const rows: Cell[][] = [['Branch/Coy', 'Rank', 'Name', 'Status', 'Sub-type', 'Start', 'End', 'Remark']];
  for (const g of abs.groups) {
    for (const a of g.items) {
      rows.push([a.unitName, a.rank, a.name, statusLabel(a.status, a.halfDay), a.subType ? SUB_TYPE_LABEL[a.subType] : '', a.startDate ?? '', a.endDate ?? '', a.remark ?? '']);
    }
  }
  return rows;
}

export function absenteesCsv(abs: AbsenteesDto): string {
  return toCsv(absenteeRows(abs));
}

export function paradeStateXlsx(summary: BattalionSummaryDto, abs: AbsenteesDto, generatedAt: Date): Uint8Array {
  const title = `15C4I Battalion parade state · ${summary.event.label} · ${formatSgDateLong(summary.event.date)}`;
  const generated = `Generated ${formatSgDateLong(generatedAt.toISOString().slice(0, 10))} ${formatSgTime(generatedAt)} · ${summary.unitsSubmitted} of ${summary.unitsTotal} units submitted`;
  const header = ['Branch/Coy', 'Strength', 'Present', ...ABSENCE_STATUSES.map((s) => STATUS_LABEL[s]), 'Unmarked', 'Status', 'Submitted at'];
  const absenceCells = (c: typeof summary.totals) => ABSENCE_STATUSES.map((s) => c[STATUS_COUNT_KEY[s]]);
  const units = [...summary.units].sort((a, b) => a.unit.sortOrder - b.unit.sortOrder);
  const summaryRows: Cell[][] = [
    [title],
    [generated],
    [],
    header,
    ...units.map((u) => [u.unit.name, u.counts.strength, u.counts.present, ...absenceCells(u.counts), u.counts.unmarked, stateText(u.submission), submittedAt(u.submission)]),
    ['Battalion', summary.totals.strength, summary.totals.present, ...absenceCells(summary.totals), summary.totals.unmarked, `${summary.unitsSubmitted} of ${summary.unitsTotal} submitted`, ''],
  ];
  return buildXlsx([
    { name: 'Summary', rows: summaryRows, boldRows: [0, 3, summaryRows.length - 1], columnWidths: [14, 10, 10, ...ABSENCE_STATUSES.map(() => 8), 10, 30, 14] },
    { name: 'Absentees', rows: absenteeRows(abs), boldRows: [0], columnWidths: [12, 8, 28, 10, 14, 12, 12, 40] },
  ]);
}
