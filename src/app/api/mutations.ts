import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EffectiveStatus, MarkBody, UnitAttendanceDto } from '@shared/types';
import { unitCounts } from '@shared/domain';
import { keys } from './keys';
import { useApi } from './provider';

export const MARK_MUTATION_KEY = ['mark'] as const;

export interface MarkVariables {
  unitId: string;
  eventId: string;
  personId: string;
  body: MarkBody;
}

/** Optimistic local view of a mark, before the server confirms it. */
function optimisticPerson(person: EffectiveStatus, body: MarkBody): EffectiveStatus {
  if (body.action === 'PRESENT' || body.action === 'BACK_TO_PRESENT') {
    return { ...person, status: 'PRESENT', subType: null, startDate: null, endDate: null, remark: null, spanId: null };
  }
  return {
    ...person,
    status: body.status,
    subType: body.status === 'OTHERS' ? body.subType ?? null : null,
    startDate: body.startDate,
    endDate: body.endDate,
    remark: body.remark?.trim() ? body.remark.trim() : null,
  };
}

export function useMarkPerson() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: MARK_MUTATION_KEY,
    mutationFn: (v: MarkVariables) => api.mark(v.unitId, v.eventId, v.personId, v.body),
    onMutate: async (v) => {
      const key = keys.attendance(v.unitId, v.eventId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UnitAttendanceDto>(key);
      if (previous) {
        const persons = previous.persons.map((p) => (p.personId === v.personId ? optimisticPerson(p, v.body) : p));
        qc.setQueryData<UnitAttendanceDto>(key, { ...previous, persons, counts: unitCounts(persons) });
      }
      return { previous };
    },
    onError: (_err, v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.attendance(v.unitId, v.eventId), ctx.previous);
    },
    onSuccess: (result, v) => {
      const key = keys.attendance(v.unitId, v.eventId);
      const current = qc.getQueryData<UnitAttendanceDto>(key);
      if (current) {
        qc.setQueryData<UnitAttendanceDto>(key, {
          ...current,
          persons: current.persons.map((p) => (p.personId === v.personId ? result.person : p)),
          counts: result.counts,
          submission: result.submission,
          changes: result.changes,
          updatedAt: result.updatedAt,
          contentHash: result.contentHash,
        });
      }
    },
  });
}

export function useMarkRemainingPresent(unitId: string, eventId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scope: { platoonId?: string | null } = {}) => api.markRemainingPresent(unitId, eventId, scope.platoonId),
    onSuccess: (dto) => qc.setQueryData<UnitAttendanceDto>(keys.attendance(unitId, eventId), dto),
  });
}

export function useSubmit(unitId: string, eventId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.submit(unitId, eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.attendance(unitId, eventId) });
      void qc.invalidateQueries({ queryKey: keys.submissions(unitId, eventId) });
      void qc.invalidateQueries({ queryKey: keys.summary(eventId) });
    },
  });
}

export function useSignIn() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { login: string; password: string }) => api.signIn(v.login, v.password),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useSignOut() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useMarkNotificationsRead() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | 'all') => api.markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useSetDemoClock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (now: string | null) => api.setDemoClock(now),
    onSuccess: () => qc.invalidateQueries(),
  });
}
