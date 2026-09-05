/**
 * In-memory API backed by the fictional battalion. Used for design review
 * (`pnpm dev:mock`) and Playwright UI tests. Mutations follow the same domain
 * rules as the Worker so the UI behaves identically against either.
 */
import { addDays, formatSgTime, sgDateOf, sgLocalToIso, type IsoDate, type IsoTimestamp } from '@shared/dates';
import type { AbsenceStatus } from '@shared/statuses';
import type {
  AbsenteesDto, BattalionSummaryDto, EventDto, MarkBody, MarkResultDto, MeDto, NotificationsDto, PersonDto,
  SettingsDto, SubmissionDto, SubmissionState, UnitAttendanceDto, UnitDto, UnitId, UserDto,
} from '@shared/types';
import {
  awaitingRank, contentHash, deriveSubmissionState, diffAgainstSnapshot, effectiveStatuses, isDateLocked,
  MarkValidationError, planMark, toSnapshot, unitCounts, sumCounts, type SnapshotEntry, type SpanRow,
} from '@shared/domain';
import { buildDemoDataset, type DemoDataset, type DemoSpan } from '@shared/demo/dataset';
import { ApiError, type ApiClient, type CreateAdhocBody, type CreatePersonBody, type CreateUserBody, type UpdatePersonBody, type UpdateUserBody } from './client';

const LATENCY_MS = 220;
const ADMIN_EMAIL = 's1admin@parade-state.demo';
const DEFAULT_EMAIL = 'cdr.coy1@parade-state.demo';

interface MockAdhoc extends EventDto { type: 'ADHOC' }

export class MockApi implements ApiClient {
  private data!: DemoDataset;
  private ready: Promise<void>;
  private currentEmail = DEFAULT_EMAIL;
  private demoNow: IsoTimestamp | null;
  private adhoc: MockAdhoc[] = [];
  private cutoffs = { am: '10:00', pm: '14:00' };
  private unlocks: { date: IsoDate; unlockedBy: string; expiresAt: IsoTimestamp }[] = [];
  private idSeq = 1;

  constructor() {
    this.ready = buildDemoDataset().then((d) => {
      this.data = d;
    });
    this.demoNow = null;
    // Open on the demo snapshot by default.
    this.demoNow = sgLocalToIso('2026-09-06', '09:24');
  }

  /** Test hook: switch the signed-in demo user. */
  signInAs(email: string) {
    this.currentEmail = email;
  }

  private async wait<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.ready;
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return fn();
  }

  private now(): Date {
    return this.demoNow ? new Date(this.demoNow) : new Date();
  }

  private nowIso(): IsoTimestamp {
    return this.now().toISOString();
  }

  private today(): IsoDate {
    return sgDateOf(this.now());
  }

  private newId(prefix: string): string {
    return `${prefix}-${String(this.idSeq++).padStart(4, '0')}`;
  }

  private currentUser(): UserDto {
    const u = this.data.users.find((x) => x.email === this.currentEmail) ?? this.data.users[1]!;
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, unitId: u.unitId, mustChangePassword: false, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' };
  }

  private unit(unitId: string): UnitDto {
    const u = this.data.units.find((x) => x.id === unitId);
    if (!u) throw new ApiError('NOT_FOUND', 'Unit not found', 404);
    return u;
  }

  private eventLabel(type: EventDto['type'], name: string | null): string {
    return type === 'AM' ? 'AM parade' : type === 'PM' ? 'PM parade' : name ?? 'Ad hoc';
  }

  private eventById(eventId: string): EventDto {
    const adhoc = this.adhoc.find((e) => e.id === eventId);
    if (adhoc) return adhoc;
    const m = /^(\d{4}-\d{2}-\d{2})-(AM|PM)$/.exec(eventId);
    if (!m) throw new ApiError('NOT_FOUND', 'Event not found', 404);
    const date = m[1]!;
    const type = m[2] as 'AM' | 'PM';
    return { id: eventId, date, type, name: null, cutoffAt: sgLocalToIso(date, type === 'AM' ? this.cutoffs.am : this.cutoffs.pm), label: this.eventLabel(type, null) };
  }

  private activeSpans(unitId: string): DemoSpan[] {
    return this.data.spans.filter((s) => s.unitId === unitId);
  }

  private computeUnit(unitId: string, event: EventDto) {
    const people = this.data.personnel.filter((p) => p.unitId === unitId);
    const spans = this.activeSpans(unitId);
    const marks = new Set(this.data.marks.filter((m) => m.unitId === unitId && m.eventId === event.id).map((m) => m.personId));
    const statuses = effectiveStatuses(people, spans, marks, event.date);
    return { statuses, counts: unitCounts(statuses) };
  }

  private async submissionFor(unitId: string, event: EventDto, hash: string): Promise<{ state: SubmissionState; changes: UnitAttendanceDto['changes']; updatedAt: IsoTimestamp | null }> {
    const subs = this.data.submissions.filter((s) => s.unitId === unitId && s.eventId === event.id).sort((a, b) => b.version - a.version);
    const latest = subs[0] ?? null;
    const activity = this.data.unitEventState.find((s) => s.unitId === unitId && s.eventId === event.id) ?? null;
    const state = deriveSubmissionState({
      latest: latest ? { version: latest.version, submittedAt: latest.submittedAt, submittedBy: latest.submittedBy, contentHash: latest.contentHash } : null,
      activity: activity ? { lastChangedAt: activity.lastChangedAt } : null,
      cutoffAt: event.cutoffAt,
      now: this.now(),
      currentHash: hash,
    });
    let changes: UnitAttendanceDto['changes'] = [];
    if (latest && (state.kind === 'SUBMITTED' || state.kind === 'RESUBMITTED') && state.hasChanges) {
      const { statuses } = this.computeUnit(unitId, event);
      changes = diffAgainstSnapshot(latest.snapshot as SnapshotEntry[], statuses);
    }
    return { state, changes, updatedAt: activity?.lastChangedAt ?? null };
  }

  private touch(unitId: UnitId, eventId: string, userId: string) {
    const at = this.nowIso();
    const row = this.data.unitEventState.find((s) => s.unitId === unitId && s.eventId === eventId);
    if (row) {
      row.lastChangedAt = at;
      row.lastChangedBy = userId;
    } else {
      this.data.unitEventState.push({ unitId, eventId, firstChangedAt: at, lastChangedAt: at, lastChangedBy: userId });
    }
    return at;
  }

  // ---- auth / meta ----

  me(): Promise<MeDto> {
    return this.wait(() => ({
      user: this.currentUser(),
      serverNow: this.nowIso(),
      sgToday: this.today(),
      demo: { enabled: true, now: this.demoNow },
    }));
  }

  units(): Promise<UnitDto[]> {
    return this.wait(() => [...this.data.units]);
  }

  events(date: IsoDate): Promise<EventDto[]> {
    return this.wait(() => [
      this.eventById(`${date}-AM`),
      this.eventById(`${date}-PM`),
      ...this.adhoc.filter((e) => e.date === date),
    ]);
  }

  createAdhocEvent(body: CreateAdhocBody): Promise<EventDto> {
    return this.wait(() => {
      const ev: MockAdhoc = { id: `${body.date}-X-${this.newId('ev')}`, date: body.date, type: 'ADHOC', name: body.name, cutoffAt: sgLocalToIso(body.date, body.cutoffTime), label: body.name };
      this.adhoc.push(ev);
      return ev;
    });
  }

  // ---- roll ----

  personnel(unitId: string, includeInactive = false): Promise<PersonDto[]> {
    return this.wait(() =>
      this.data.personnel
        .filter((p) => p.unitId === unitId && (includeInactive || p.postedOutDate === null))
        .map((p) => ({ id: p.id, unitId: p.unitId, rank: p.rank, name: p.name, serviceNo: p.serviceNo, postedInDate: p.postedInDate, postedOutDate: p.postedOutDate })),
    );
  }

  createPerson(unitId: string, body: CreatePersonBody): Promise<PersonDto> {
    return this.wait(() => {
      const unit = this.unit(unitId);
      const p = { id: this.newId('p'), unitId: unit.id, rank: body.rank, name: body.name.trim(), serviceNo: body.serviceNo ?? null, postedInDate: body.postedInDate ?? this.today(), postedOutDate: null };
      this.data.personnel.push(p);
      return { ...p };
    });
  }

  updatePerson(unitId: string, personId: string, body: UpdatePersonBody): Promise<PersonDto> {
    return this.wait(() => {
      const p = this.data.personnel.find((x) => x.id === personId && x.unitId === unitId);
      if (!p) throw new ApiError('NOT_FOUND', 'Person not found', 404);
      if (body.rank !== undefined) p.rank = body.rank;
      if (body.name !== undefined) p.name = body.name.trim();
      if (body.serviceNo !== undefined) p.serviceNo = body.serviceNo;
      if (body.postedOutDate !== undefined) p.postedOutDate = body.postedOutDate;
      return { ...p };
    });
  }

  // ---- attendance ----

  unitAttendance(unitId: string, eventId: string): Promise<UnitAttendanceDto> {
    return this.wait(async () => {
      const unit = this.unit(unitId);
      const event = this.eventById(eventId);
      const { statuses, counts } = this.computeUnit(unitId, event);
      const hash = await contentHash(statuses);
      const sub = await this.submissionFor(unitId, event, hash);
      const user = this.currentUser();
      const locked = user.role === 'ADMIN' ? false : isDateLocked(event.date, this.today(), this.unlocks, this.now());
      return { unit, event, persons: statuses, counts, submission: sub.state, changes: sub.changes, updatedAt: sub.updatedAt, locked, contentHash: hash };
    });
  }

  mark(unitId: string, eventId: string, personId: string, body: MarkBody): Promise<MarkResultDto> {
    return this.wait(async () => {
      const unit = this.unit(unitId);
      const event = this.eventById(eventId);
      const user = this.currentUser();
      if (user.role !== 'ADMIN' && isDateLocked(event.date, this.today(), this.unlocks, this.now())) {
        throw new ApiError('DATE_LOCKED', 'This date is locked. Ask S1 to unlock it to make corrections.', 403);
      }
      const person = this.data.personnel.find((p) => p.id === personId && p.unitId === unitId);
      if (!person) throw new ApiError('NOT_FOUND', 'Person not found in this unit', 404);
      let plan;
      try {
        plan = planMark(body, personId, this.activeSpans(unitId), event.date);
      } catch (e) {
        if (e instanceof MarkValidationError) throw new ApiError('VALIDATION', e.message, 400, { field: e.field });
        throw e;
      }
      const nowIso = this.nowIso();
      this.data.spans = this.data.spans.filter((s) => !plan.supersedeSpanIds.includes(s.id));
      for (const ns of plan.insertSpans) {
        this.data.spans.push({ id: this.newId('span'), unitId: unit.id, personId: ns.personId, status: ns.status as AbsenceStatus, subType: ns.subType, startDate: ns.startDate, endDate: ns.endDate, remark: ns.remark, createdAt: nowIso, createdBy: user.id });
      }
      if (plan.deleteMarksInRange) {
        const { start, end } = plan.deleteMarksInRange;
        this.data.marks = this.data.marks.filter((m) => {
          if (m.personId !== personId) return true;
          const d = this.eventById(m.eventId).date;
          return !(d >= start && (end === null || d <= end));
        });
      }
      if (plan.upsertPresentMark && !this.data.marks.some((m) => m.personId === personId && m.eventId === eventId)) {
        this.data.marks.push({ eventId, personId, unitId: unit.id, markedBy: user.id, markedAt: nowIso });
      }
      const updatedAt = this.touch(unit.id, eventId, user.id);
      const { statuses, counts } = this.computeUnit(unitId, event);
      const hash = await contentHash(statuses);
      const sub = await this.submissionFor(unitId, event, hash);
      const row = statuses.find((s) => s.personId === personId)!;
      return { person: row, counts, submission: sub.state, changes: sub.changes, updatedAt, contentHash: hash };
    });
  }

  submit(unitId: string, eventId: string): Promise<SubmissionDto> {
    return this.wait(async () => {
      const unit = this.unit(unitId);
      const event = this.eventById(eventId);
      const user = this.currentUser();
      const { statuses, counts } = this.computeUnit(unitId, event);
      const hash = await contentHash(statuses);
      const existing = this.data.submissions.filter((s) => s.unitId === unitId && s.eventId === eventId).sort((a, b) => b.version - a.version);
      const latest = existing[0];
      if (latest && latest.contentHash === hash) throw new ApiError('CONFLICT', 'Nothing has changed since the last submission.', 409);
      const version = (latest?.version ?? 0) + 1;
      const submittedAt = this.nowIso();
      const sub = { id: this.newId('sub'), unitId: unit.id, eventId, version, submittedBy: user.id, submittedAt, contentHash: hash, counts, snapshot: toSnapshot(statuses) };
      this.data.submissions.push(sub);
      const admin = this.data.users.find((u) => u.role === 'ADMIN')!;
      const label = version === 1 ? 'submitted' : `resubmitted (v${version})`;
      this.data.notifications.unshift({ id: this.newId('n'), userId: admin.id, type: version === 1 ? 'SUBMITTED' : 'RESUBMITTED', unitId: unit.id, eventId, submissionId: sub.id, message: `${unit.name} ${label} ${event.label} · ${counts.present}/${counts.strength} present`, createdAt: submittedAt, readAt: null });
      return { id: sub.id, unitId: unit.id, eventId, version, submittedAt, submittedBy: user.id, submittedByName: user.displayName, counts, contentHash: hash };
    });
  }

  submissions(unitId: string, eventId: string): Promise<SubmissionDto[]> {
    return this.wait(() =>
      this.data.submissions
        .filter((s) => s.unitId === unitId && s.eventId === eventId)
        .sort((a, b) => b.version - a.version)
        .map((s) => ({ id: s.id, unitId: s.unitId, eventId: s.eventId, version: s.version, submittedAt: s.submittedAt, submittedBy: s.submittedBy, submittedByName: this.data.users.find((u) => u.id === s.submittedBy)?.displayName ?? 'Unknown', counts: s.counts, contentHash: s.contentHash })),
    );
  }

  // ---- admin ----

  summary(eventId: string): Promise<BattalionSummaryDto> {
    return this.wait(async () => {
      const event = this.eventById(eventId);
      const rows = [];
      for (const unit of this.data.units) {
        const { statuses, counts } = this.computeUnit(unit.id, event);
        const hash = await contentHash(statuses);
        const sub = await this.submissionFor(unit.id, event, hash);
        rows.push({ unit, counts, submission: sub.state });
      }
      this.ensureLateNotifications(event);
      rows.sort((a, b) => awaitingRank(a.submission) - awaitingRank(b.submission) || a.unit.sortOrder - b.unit.sortOrder);
      const submitted = rows.filter((r) => r.submission.kind === 'SUBMITTED' || r.submission.kind === 'RESUBMITTED').length;
      return { event, totals: sumCounts(rows.map((r) => r.counts)), unitsSubmitted: submitted, unitsTotal: rows.length, units: rows, serverNow: this.nowIso() };
    });
  }

  private ensureLateNotifications(event: EventDto) {
    if (this.now().getTime() < Date.parse(event.cutoffAt)) return;
    const admin = this.data.users.find((u) => u.role === 'ADMIN')!;
    for (const unit of this.data.units) {
      const submitted = this.data.submissions.some((s) => s.unitId === unit.id && s.eventId === event.id);
      const already = this.data.notifications.some((n) => n.type === 'LATE' && n.unitId === unit.id && n.eventId === event.id);
      if (!submitted && !already) {
        this.data.notifications.unshift({ id: this.newId('n'), userId: admin.id, type: 'LATE', unitId: unit.id, eventId: event.id, submissionId: null, message: `${unit.name} has not submitted ${event.label} · cut-off ${formatSgTime(event.cutoffAt)}`, createdAt: event.cutoffAt, readAt: null });
      }
    }
  }

  absentees(eventId: string): Promise<AbsenteesDto> {
    return this.wait(() => {
      const event = this.eventById(eventId);
      const order: AbsenceStatus[] = ['MC', 'LL', 'MA', 'RSI', 'OTHERS'];
      const groups = order.map((status) => ({ status, items: [] as AbsenteesDto['groups'][number]['items'] }));
      for (const unit of this.data.units) {
        const { statuses } = this.computeUnit(unit.id, event);
        for (const s of statuses) {
          if (s.status === 'PRESENT') continue;
          groups.find((g) => g.status === s.status)!.items.push({ personId: s.personId, rank: s.rank, name: s.name, unitId: unit.id, unitName: unit.name, status: s.status, subType: s.subType, startDate: s.startDate, endDate: s.endDate, remark: s.remark });
        }
      }
      const total = groups.reduce((n, g) => n + g.items.length, 0);
      return { event, total, groups: groups.filter((g) => g.items.length > 0) };
    });
  }

  exportUrl(eventId: string, format: 'xlsx' | 'csv'): string {
    return `/api/admin/export/${eventId}.${format}`;
  }

  download(eventId: string, format: 'xlsx' | 'csv'): Promise<Blob> {
    return this.wait(async () => {
      const abs = await this.absentees(eventId);
      const lines = [['Unit', 'Rank', 'Name', 'Status', 'Sub-type', 'Start', 'End', 'Remark'].join(',')];
      for (const g of abs.groups) for (const i of g.items) lines.push([i.unitName, i.rank, i.name, i.status, i.subType ?? '', i.startDate ?? '', i.endDate ?? '', JSON.stringify(i.remark ?? '')].join(','));
      return new Blob([`﻿${lines.join('\r\n')}`], { type: format === 'csv' ? 'text/csv' : 'application/octet-stream' });
    });
  }

  notifications(): Promise<NotificationsDto> {
    return this.wait(() => {
      const items = this.data.notifications.map((n) => ({ id: n.id, type: n.type, unitId: n.unitId, unitName: this.unit(n.unitId).name, eventId: n.eventId, message: n.message, createdAt: n.createdAt, readAt: n.readAt }));
      return { items, unreadCount: items.filter((n) => !n.readAt).length };
    });
  }

  markNotificationsRead(ids: string[] | 'all'): Promise<void> {
    return this.wait(() => {
      const at = this.nowIso();
      for (const n of this.data.notifications) if (!n.readAt && (ids === 'all' || ids.includes(n.id))) n.readAt = at;
    });
  }

  users(): Promise<UserDto[]> {
    return this.wait(() => this.data.users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, unitId: u.unitId, mustChangePassword: false, isActive: true, createdAt: '2026-08-01T00:00:00.000Z' })));
  }

  createUser(body: CreateUserBody): Promise<UserDto> {
    return this.wait(() => {
      if (this.data.users.some((u) => u.email === body.email.toLowerCase())) throw new ApiError('CONFLICT', 'An account with this email already exists', 409);
      const u = { id: this.newId('u'), email: body.email.toLowerCase(), displayName: body.displayName, role: body.role, unitId: (body.unitId as UnitId | null) ?? null };
      this.data.users.push(u);
      return { ...u, mustChangePassword: true, isActive: true, createdAt: this.nowIso() };
    });
  }

  updateUser(id: string, body: UpdateUserBody): Promise<UserDto> {
    return this.wait(() => {
      const u = this.data.users.find((x) => x.id === id);
      if (!u) throw new ApiError('NOT_FOUND', 'User not found', 404);
      if (body.displayName !== undefined) u.displayName = body.displayName;
      if (body.unitId !== undefined) u.unitId = body.unitId as UnitId | null;
      return { ...u, mustChangePassword: false, isActive: body.isActive ?? true, createdAt: '2026-08-01T00:00:00.000Z' };
    });
  }

  resetPassword(): Promise<void> {
    return this.wait(() => undefined);
  }

  settings(): Promise<SettingsDto> {
    return this.wait(() => ({ cutoffAm: this.cutoffs.am, cutoffPm: this.cutoffs.pm, dateUnlocks: [...this.unlocks] }));
  }

  updateSettings(body: { cutoffAm?: string; cutoffPm?: string }): Promise<SettingsDto> {
    return this.wait(() => {
      if (body.cutoffAm) this.cutoffs.am = body.cutoffAm;
      if (body.cutoffPm) this.cutoffs.pm = body.cutoffPm;
      return { cutoffAm: this.cutoffs.am, cutoffPm: this.cutoffs.pm, dateUnlocks: [...this.unlocks] };
    });
  }

  unlockDate(date: IsoDate): Promise<SettingsDto> {
    return this.wait(() => {
      this.unlocks = this.unlocks.filter((u) => u.date !== date);
      this.unlocks.push({ date, unlockedBy: this.currentUser().displayName, expiresAt: new Date(this.now().getTime() + 24 * 3600_000).toISOString() });
      return { cutoffAm: this.cutoffs.am, cutoffPm: this.cutoffs.pm, dateUnlocks: [...this.unlocks] };
    });
  }

  relockDate(date: IsoDate): Promise<SettingsDto> {
    return this.wait(() => {
      this.unlocks = this.unlocks.filter((u) => u.date !== date);
      return { cutoffAm: this.cutoffs.am, cutoffPm: this.cutoffs.pm, dateUnlocks: [...this.unlocks] };
    });
  }

  demoClock(): Promise<IsoTimestamp | null> {
    return this.wait(() => this.demoNow);
  }

  setDemoClock(now: IsoTimestamp | null): Promise<void> {
    return this.wait(() => {
      this.demoNow = now;
    });
  }

  /** Test hook: move the demo clock by whole days without changing the time of day. */
  shiftDemoDate(days: number) {
    if (!this.demoNow) return;
    const d = sgDateOf(this.demoNow);
    this.demoNow = sgLocalToIso(addDays(d, days), formatSgTime(this.demoNow));
  }

  static readonly ADMIN_EMAIL = ADMIN_EMAIL;
  static readonly DEFAULT_EMAIL = DEFAULT_EMAIL;
}
