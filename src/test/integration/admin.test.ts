import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDemoDataset, type DemoDataset } from '@shared/demo/dataset';
import { insertDemoData } from '../../worker/db/seedDemo';
import { createHarness, type Harness } from './harness';
import type { AbsenteesDto, BattalionSummaryDto, NotificationsDto, UnitAttendanceDto } from '@shared/types';

let h: Harness;
let data: DemoDataset;
let admin: string;
let cdr1: string;
const AM = '2026-09-06-AM';

beforeAll(async () => {
  h = await createHarness({ DEMO_CONTROLS: 'true' } as never);
  data = await buildDemoDataset();
  await insertDemoData(h.db, data, new Map(data.users.map((u) => [u.id, u.id])));
  admin = data.users.find((u) => u.role === 'ADMIN')!.id;
  cdr1 = data.users.find((u) => u.unitId === 'COY1')!.id;
});
afterAll(async () => { await h.close(); });

describe('battalion summary on the demo battalion', () => {
  it('shows the battalion at 09:24: 269 / 318 marked present, 24 not yet marked, 25 absent, 7 of 9 submitted', async () => {
    const { status, body } = await h.json<BattalionSummaryDto>(`/admin/summary/${AM}`, { as: admin });
    expect(status).toBe(200);
    expect(body.totals).toMatchObject({ strength: 318, present: 269, unmarked: 24, absent: 25, mc: 9, ll: 5, ma: 4, rsi: 3, others: 4 });
    expect(body.unitsSubmitted).toBe(7);
    expect(body.unitsTotal).toBe(9);
    expect(body.units.slice(0, 2).map((u) => [u.unit.name, u.submission.kind])).toEqual([['Coy 1', 'PENDING'], ['S2', 'NOT_MARKED']]);
    const ssp = body.units.find((u) => u.unit.name === 'SSP')!;
    expect(ssp.submission).toMatchObject({ kind: 'RESUBMITTED', version: 2, hasChanges: false });
    expect(ssp.counts).toMatchObject({ strength: 24, present: 22, rsi: 1, others: 1 });
    const coy1 = body.units.find((u) => u.unit.name === 'Coy 1')!;
    expect(coy1.counts).toMatchObject({ strength: 102, present: 86, unmarked: 10, mc: 2, ll: 1, ma: 1, rsi: 1, others: 1 });
    expect(body.units.find((u) => u.unit.name === 'S2')!.counts).toMatchObject({ present: 0, unmarked: 14 });
  });

  it('is admin only', async () => {
    expect((await h.request(`/admin/summary/${AM}`, { as: cdr1 })).status).toBe(403);
  });

  it('lists the 25 absentees grouped by status in fixed order with unit and dates', async () => {
    const { body } = await h.json<AbsenteesDto>(`/admin/absentees/${AM}`, { as: admin });
    expect(body.total).toBe(25);
    expect(body.groups.map((g) => [g.status, g.items.length])).toEqual([['LL', 5], ['RSI', 3], ['MC', 9], ['MA', 4], ['OTHERS', 4]]);
    const daniel = body.groups.find((g) => g.status === 'MC')!.items.find((i) => i.name === 'Daniel Tan')!;
    expect(daniel).toMatchObject({ rank: 'CPL', unitName: 'Coy 1', status: 'MC', startDate: '2026-09-05', endDate: '2026-09-08' });
    const ethan = body.groups.find((g) => g.status === 'OTHERS')!.items.find((i) => i.name === 'Ethan Goh')!;
    expect(ethan).toMatchObject({ subType: 'COURSE', endDate: '2026-09-11' });
  });

  it('the commander view of Coy 1 shows 86 / 102 pending with 10 to mark and the brief\'s example rows', async () => {
    const { body } = await h.json<UnitAttendanceDto>(`/units/COY1/attendance/${AM}`, { as: cdr1 });
    expect(body.counts).toMatchObject({ present: 86, unmarked: 10, strength: 102 });
    expect(body.submission.kind).toBe('PENDING');
    const names = Object.fromEntries(body.persons.map((p) => [p.name, p]));
    expect(names['Daniel Tan']).toMatchObject({ rank: 'CPL', status: 'MC', endDate: '2026-09-08' });
    expect(names['Marcus Lee']).toMatchObject({ rank: 'CPL', status: 'LL', endDate: '2026-09-09' });
    expect(names['Ryan Lim']).toMatchObject({ rank: '3SG', status: 'PRESENT' });
  });

  it('after the AM cut-off the dashboard turns the two unsubmitted units Late and notifies once', async () => {
    await h.json('/admin/demo-clock', { method: 'PUT', as: admin, json: { now: '2026-09-06T02:05:00.000Z' } });
    const { body } = await h.json<BattalionSummaryDto>(`/admin/summary/${AM}`, { as: admin });
    expect(body.units.filter((u) => u.submission.kind === 'LATE').map((u) => u.unit.name).sort()).toEqual(['Coy 1', 'S2']);
    await h.json(`/admin/summary/${AM}`, { as: admin });
    const n = await h.json<NotificationsDto>('/notifications', { as: admin });
    expect(n.body.items.filter((i) => i.type === 'LATE')).toHaveLength(2);
    expect(n.body.unreadCount).toBe(3 + 2);
    await h.json('/admin/demo-clock', { method: 'PUT', as: admin, json: { now: data.now } });
  });
});

describe('export', () => {
  it('CSV lists the absentees with a BOM and CRLF line endings', async () => {
    const res = await h.request(`/admin/export/${AM}.csv`, { as: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="parade-state-2026-09-06-am.csv"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // Response.text() would strip the BOM, so check bytes
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('Branch/Coy,Rank,Name,Status,Sub-type,Start,End,Remark\r\n')).toBe(true);
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(26);
    expect(lines.some((l) => l.includes('Coy 1,CPL,Daniel Tan,MC,,2026-09-05,2026-09-08,"Fever, Bedok Polyclinic"'))).toBe(true);
  });

  it('the monthly XLSX lists every parade of the month as submitted', async () => {
    expect((await h.request('/admin/export/month/2026-13.xlsx', { as: admin })).status).toBe(404);
    expect((await h.request('/admin/export/month/2026-09.xlsx', { as: cdr1 })).status).toBe(403);
    const res = await h.request('/admin/export/month/2026-09.xlsx', { as: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="parade-state-2026-09.xlsx"');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']!);
    expect(workbook).toContain('name="Battalion by day"');
    expect(workbook).toContain('name="Branches by day"');
    expect(workbook).toContain('name="Absentees"');
    const byDay = strFromU8(files['xl/worksheets/sheet1.xml']!);
    // 1–5 Sep: AM parades from the demo history, plus 6 Sep AM (7 of 9) and PM (nobody yet). No Roll Call rows without submissions.
    expect(byDay).toContain('<t xml:space="preserve">2026-09-05</t>');
    expect(byDay).toContain('<t xml:space="preserve">7 of 9</t>');
    expect(byDay).not.toContain('Roll call');
    const byUnit = strFromU8(files['xl/worksheets/sheet2.xml']!);
    expect(byUnit).toContain('<t xml:space="preserve">Not submitted</t>');
    expect(byUnit).toContain('<t xml:space="preserve">Coy 1</t>');
    const absentees = strFromU8(files['xl/worksheets/sheet3.xml']!);
    expect(absentees).toContain('<t xml:space="preserve">Daniel Tan</t>');
  });

  it('XLSX is a valid workbook with Summary and Absentees sheets', async () => {
    const res = await h.request(`/admin/export/${AM}.xlsx`, { as: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    const workbook = strFromU8(files['xl/workbook.xml']!);
    expect(workbook).toContain('name="Summary"');
    expect(workbook).toContain('name="Absentees"');
    const summary = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(summary).toContain('<t xml:space="preserve">Coy 1</t>');
    expect(summary).toContain('<v>318</v>');
    expect(summary).toContain('<v>269</v>');
    expect(summary).toContain('Unmarked');
    const abs = strFromU8(files['xl/worksheets/sheet2.xml']!);
    expect(abs).toContain('Daniel Tan');
    expect(abs).toContain('Fever, Bedok Polyclinic');
  });

  it('rejects unknown formats and non-admins', async () => {
    expect((await h.request(`/admin/export/${AM}.pdf`, { as: admin })).status).toBe(404);
    expect((await h.request(`/admin/export/${AM}.csv`, { as: cdr1 })).status).toBe(403);
  });
});
