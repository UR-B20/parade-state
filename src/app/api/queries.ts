/**
 * Server state for the screens. Reads are TanStack queries persisted to IndexedDB so the last
 * roll is on screen without signal; writes go through the offline queue and update the cache
 * optimistically, then with the server's answer.
 */
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { sgDateOf } from '@shared/dates';
import { unitCounts } from '@shared/domain';
import type { EffectiveStatus, MarkBody, MeDto, SubmissionDto, SubmitBody, UnitAttendanceDto } from '@shared/types';
import { ApiError } from './client';
import type { OpResult, OfflineQueue, QueuedOp } from '../offline/queue';
import { useBackend, useQueue } from '../providers';

export const keys = {
  me: ['me'] as const,
  units: ['units'] as const,
  events: (date: string | undefined) => ['events', date ?? 'today'] as const,
  attendance: (unitId: string, eventId: string) => ['attendance', unitId, eventId] as const,
  submissions: (unitId: string, eventId: string) => ['submissions', unitId, eventId] as const,
  users: ['admin', 'users'] as const,
};

export function useMe(enabled = true) {
  const { api } = useBackend();
  return useQuery({ queryKey: keys.me, queryFn: () => api.me(), enabled, staleTime: 60_000 });
}

export function useEvents(date?: string) {
  const { api } = useBackend();
  return useQuery({ queryKey: keys.events(date), queryFn: () => api.events(date), staleTime: 5 * 60_000 });
}

export function useAttendance(unitId: string, eventId: string) {
  const { api } = useBackend();
  return useQuery({
    queryKey: keys.attendance(unitId, eventId),
    queryFn: () => api.attendance(unitId, eventId),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useSubmissions(unitId: string, eventId: string) {
  const { api } = useBackend();
  return useQuery({ queryKey: keys.submissions(unitId, eventId), queryFn: () => api.submissions(unitId, eventId) });
}

export function useUnits() {
  const { api } = useBackend();
  return useQuery({ queryKey: keys.units, queryFn: () => api.units(), staleTime: 60 * 60_000 });
}

export function useUsers() {
  const { api } = useBackend();
  return useQuery({ queryKey: keys.users, queryFn: () => api.admin.users() });
}

/** Number of writes still waiting for the server (re-renders as it changes). */
export function usePendingCount(unitId?: string, eventId?: string): number {
  const queue = useQueue();
  const subscribe = useCallback((cb: () => void) => queue.subscribe(cb), [queue]);
  return useSyncExternalStore(subscribe, () => (unitId && eventId ? queue.pendingFor(unitId, eventId).length : queue.size));
}

const PRESENT = (s: EffectiveStatus): EffectiveStatus => ({
  ...s,
  status: 'PRESENT',
  confirmed: true,
  subType: null,
  startDate: null,
  endDate: null,
  remark: null,
  spanId: null,
});

/** What the roll will look like once the server applies a mark. */
function applyMarkLocally(data: UnitAttendanceDto, personId: string, body: MarkBody, now: string): UnitAttendanceDto {
  const persons = data.persons.map((p) => {
    if (p.personId !== personId) return p;
    if (body.action === 'SET') {
      const single = body.status === 'RSI';
      return {
        ...p,
        status: body.status,
        confirmed: true,
        subType: body.status === 'OTHERS' ? (body.subType ?? null) : null,
        startDate: single ? data.event.date : body.startDate,
        endDate: single ? data.event.date : body.endDate,
        remark: body.remark?.trim() || null,
        spanId: 'pending',
      };
    }
    return PRESENT(p);
  });
  const counts = unitCounts(persons);
  let submission = data.submission;
  if (submission.kind === 'NOT_MARKED') submission = { kind: 'PENDING', lastChangedAt: now };
  else if (submission.kind === 'PENDING') submission = { ...submission, lastChangedAt: now };
  else if (submission.kind === 'LATE') submission = { ...submission, hasActivity: true, lastChangedAt: now };
  else submission = { ...submission, hasChanges: true };
  return { ...data, persons, counts, submission, updatedAt: now };
}

function applySubmitLocally(data: UnitAttendanceDto, me: MeDto | undefined, now: string): UnitAttendanceDto {
  const previous = data.submission.kind === 'SUBMITTED' || data.submission.kind === 'RESUBMITTED' ? data.submission.version : 0;
  const version = previous + 1;
  return {
    ...data,
    changes: [],
    submission: {
      kind: version === 1 ? 'SUBMITTED' : 'RESUBMITTED',
      version,
      submittedAt: now,
      submittedBy: me?.user.id ?? '',
      wasLate: Date.parse(now) >= Date.parse(data.event.cutoffAt),
      hasChanges: false,
    },
  };
}

/** The instant to stamp on local changes: the demo clock when one is running, else the phone's clock. */
function localNow(qc: QueryClient): string {
  return qc.getQueryData<MeDto>(keys.me)?.demo.now ?? new Date().toISOString();
}

export function useMarkPerson(unitId: string, eventId: string) {
  const queue = useQueue();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ personId, body }: { personId: string; body: MarkBody }) => {
      const now = localNow(qc);
      qc.setQueryData<UnitAttendanceDto>(keys.attendance(unitId, eventId), (data) => (data ? applyMarkLocally(data, personId, body, now) : data));
      await queue.enqueue({ kind: 'mark', unitId, eventId, personId, body });
    },
  });
}

export function useSubmitUnit(unitId: string, eventId: string) {
  const queue = useQueue();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitBody) => {
      const now = localNow(qc);
      const me = qc.getQueryData<MeDto>(keys.me);
      qc.setQueryData<UnitAttendanceDto>(keys.attendance(unitId, eventId), (data) => (data ? applySubmitLocally(data, me, now) : data));
      await queue.enqueue({ kind: 'submit', unitId, eventId, body });
    },
  });
}

export interface QueueNotice {
  op: QueuedOp;
  error: ApiError;
}

/** Wire the queue's outcomes into the cache. Returns the handlers the queue needs. */
export function queueHandlers(qc: QueryClient, onRejected: (notice: QueueNotice) => void) {
  return {
    onApplied(r: OpResult) {
      const key = keys.attendance(r.op.unitId, r.op.eventId);
      if (r.kind === 'mark') {
        qc.setQueryData<UnitAttendanceDto>(key, (data) => {
          if (!data) return data;
          const persons = data.persons.map((p) => (p.personId === r.result.person.personId ? r.result.person : p));
          return { ...data, persons, counts: r.result.counts, submission: r.result.submission, changes: r.result.changes, updatedAt: r.result.updatedAt, contentHash: r.result.contentHash };
        });
      } else {
        qc.setQueryData<UnitAttendanceDto>(key, r.result.attendance);
        qc.setQueryData<{ submissions: SubmissionDto[] }>(keys.submissions(r.op.unitId, r.op.eventId), (data) =>
          data ? { submissions: [r.result.submission, ...data.submissions.filter((s) => s.id !== r.result.submission.id)] } : data,
        );
      }
    },
    onRejected(op: QueuedOp, error: ApiError) {
      void qc.invalidateQueries({ queryKey: keys.attendance(op.unitId, op.eventId) });
      onRejected({ op, error });
    },
  };
}

export function todaySg(me: MeDto | undefined): string {
  return me?.sgToday ?? sgDateOf(new Date());
}

export type { OfflineQueue };
