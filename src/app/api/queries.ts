import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IsoDate } from '@shared/dates';
import { keys } from './keys';
import { useApi } from './provider';

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: keys.me, queryFn: () => api.me(), staleTime: 60_000, retry: false });
}

export function useDemoAccounts() {
  const api = useApi();
  return useQuery({ queryKey: ['demo-accounts'], queryFn: () => api.demoAccounts(), staleTime: Infinity, retry: false });
}

export function useUnits() {
  const api = useApi();
  return useQuery({ queryKey: keys.units, queryFn: () => api.units(), staleTime: Infinity });
}

export function useEvents(date: IsoDate) {
  const api = useApi();
  return useQuery({ queryKey: keys.events(date), queryFn: () => api.events(date), staleTime: 60_000 });
}

export function useUnitAttendance(unitId: string | null, eventId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.attendance(unitId ?? '', eventId ?? ''),
    queryFn: () => api.unitAttendance(unitId!, eventId!),
    enabled: !!unitId && !!eventId,
    staleTime: 15_000,
  });
}

export function usePersonnel(unitId: string | null, includeInactive = false) {
  const api = useApi();
  return useQuery({
    queryKey: keys.personnel(unitId ?? '', includeInactive),
    queryFn: () => api.personnel(unitId!, includeInactive),
    enabled: !!unitId,
  });
}

export function useSummary(eventId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.summary(eventId ?? ''),
    queryFn: () => api.summary(eventId!),
    enabled: !!eventId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useAbsentees(eventId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.absentees(eventId ?? ''),
    queryFn: () => api.absentees(eventId!),
    enabled: !!eventId,
    staleTime: 15_000,
  });
}

export function useNotifications(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.notifications(),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useUsers(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: keys.users, queryFn: () => api.users(), enabled });
}

export function useSettings(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: keys.settings, queryFn: () => api.settings(), enabled });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    attendance: (unitId: string, eventId: string) => qc.invalidateQueries({ queryKey: keys.attendance(unitId, eventId) }),
    admin: (eventId: string) => {
      void qc.invalidateQueries({ queryKey: keys.summary(eventId) });
      void qc.invalidateQueries({ queryKey: keys.absentees(eventId) });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
    all: () => qc.invalidateQueries(),
  };
}
