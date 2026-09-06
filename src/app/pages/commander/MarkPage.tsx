import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountButton, AccountMenu } from '../../components/AccountMenu';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutationState } from '@tanstack/react-query';
import { formatSgDateLong, formatSgTime, sgDateOf, type IsoDate } from '@shared/dates';
import type { EffectiveStatus, MarkBody } from '@shared/types';
import { useEvents, useUnitAttendance, useUnitTrends } from '../../api/queries';
import { MARK_MUTATION_KEY, useMarkPerson, useMarkRemainingPresent, useSubmit, type MarkVariables } from '../../api/mutations';
import { ApiError } from '../../api/client';
import { useAuth } from '../../state/auth';
import { useConnection } from '../../state/connection';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConnectionBanner, LockedDateNotice } from '../../components/ConnectionBanner';
import { EmptyState } from '../../components/EmptyState';
import { EventPicker } from '../../components/EventPicker';
import { FilterChips, type RollFilter } from '../../components/FilterChips';
import { Icon } from '../../components/Icon';
import { PersonRow } from '../../components/PersonRow';
import { SearchField } from '../../components/SearchField';
import { SkeletonRows, SkeletonSummary } from '../../components/Skeleton';
import { StatusPill } from '../../components/StatusPill';
import { StatusSheet } from '../../components/StatusSheet';
import { StrengthSummary } from '../../components/StrengthSummary';
import { UnitTrendCard } from '../../components/UnitTrendCard';
import { ALL_PLATOONS, NO_PLATOON, PlatoonBreakdown, PlatoonPicker } from '../../components/PlatoonPicker';
import { unitCounts } from '@shared/domain';
import { SubmitFooter } from '../../components/SubmitFooter';
import { useToast } from '../../components/Toast';
import '../pages.css';

function useNow(): Date {
  const me = useAuth();
  return useMemo(() => new Date(me.demo.now ?? me.serverNow), [me.demo.now, me.serverNow]);
}

export function MarkPage({ unitId: unitIdProp }: { unitId?: string } = {}) {
  const me = useAuth();
  const now = useNow();
  const unitId = unitIdProp ?? me.user.unitId;
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const today = sgDateOf(now);
  const date: IsoDate = params.get('date') ?? today;
  const eventsQ = useEvents(date);
  const events = eventsQ.data;

  // Default event: AM before noon Singapore time, PM after.
  const defaultEventId = useMemo(() => {
    if (!events) return null;
    const hour = Number(formatSgTime(now).slice(0, 2));
    const wantPm = date === today && hour >= 12;
    return (events.find((e) => e.type === (wantPm ? 'PM' : 'AM')) ?? events[0])?.id ?? null;
  }, [events, now, date, today]);
  const eventId = params.get('event') ?? defaultEventId;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      }, { replace: true });
    },
    [setParams],
  );

  const attendanceQ = useUnitAttendance(unitId, eventId);
  const trendsQ = useUnitTrends(unitId, eventId);
  const data = attendanceQ.data;
  const event = data?.event ?? events?.find((e) => e.id === eventId) ?? null;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RollFilter>('ALL');
  const platoonParam = params.get('platoon') ?? ALL_PLATOONS;
  const hasPlatoons = (data?.platoons.length ?? 0) > 0;
  const platoon = hasPlatoons ? platoonParam : ALL_PLATOONS;
  const setPlatoon = (id: string) => setParam('platoon', id === ALL_PLATOONS ? null : id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetNotPresent, setSheetNotPresent] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const readOnly = me.user.role === 'ADMIN' || !!data?.locked;

  useEffect(() => {
    setSelectedId(null);
  }, [eventId]);

  const allPersons = data?.persons ?? [];
  const persons = useMemo(() => {
    if (platoon === ALL_PLATOONS) return allPersons;
    if (platoon === NO_PLATOON) return allPersons.filter((p) => !p.platoonId || !data?.unit.platoons.some((pl) => pl.id === p.platoonId));
    return allPersons.filter((p) => p.platoonId === platoon);
  }, [allPersons, platoon, data?.unit.platoons]);
  const scopeCounts = useMemo(() => (platoon === ALL_PLATOONS ? data?.counts : unitCounts(persons)), [platoon, data?.counts, persons]);
  const scopeLabel = platoon === ALL_PLATOONS ? null : platoon === NO_PLATOON ? 'Unassigned' : data?.unit.platoons.find((p) => p.id === platoon)?.name ?? null;
  const selected = selectedId ? allPersons.find((p) => p.personId === selectedId) ?? null : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return persons.filter((p) => {
      if (q && !`${p.rank} ${p.name}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case 'ALL': return true;
        case 'ABSENT': return p.status !== 'PRESENT';
        case 'UNMARKED': return p.status === 'UNMARKED';
        default: return p.status === filter;
      }
    });
  }, [persons, search, filter]);

  const pendingIds = new Set(
    useMutationState({ filters: { mutationKey: MARK_MUTATION_KEY, status: 'pending' }, select: (m) => (m.state.variables as MarkVariables).personId }),
  );

  const mark = useMarkPerson();
  const bulk = useMarkRemainingPresent(unitId ?? '', eventId ?? '');
  const submit = useSubmit(unitId ?? '', eventId ?? '');
  const connection = useConnection();

  const markPerson = (personId: string, body: MarkBody) => {
    if (!unitId || !eventId) return;
    mark.mutate(
      { unitId, eventId, personId, body },
      {
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : "Couldn't save the change.";
          toast.show(message, { tone: 'error', action: { label: 'Retry', onClick: () => mark.mutate({ unitId, eventId, personId, body }) } });
        },
      },
    );
  };

  const onMarkRemainingPresent = async () => {
    try {
      const dto = await bulk.mutateAsync();
      toast.show(`Everyone marked · ${dto.counts.present} present`);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Couldn't mark the remaining personnel.", { tone: 'error' });
      throw err;
    }
  };

  const onSave = (body: MarkBody) => {
    if (!unitId || !eventId || !selected) return;
    const personId = selected.personId;
    setSelectedId(null);
    mark.mutate(
      { unitId, eventId, personId, body },
      {
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : "Couldn't save the change.";
          toast.show(message, { tone: 'error', action: { label: 'Retry', onClick: () => mark.mutate({ unitId, eventId, personId, body }) } });
        },
      },
    );
  };

  const onSubmit = async () => {
    try {
      const sub = await submit.mutateAsync();
      toast.show(`${sub.version > 1 ? `Resubmitted v${sub.version}` : 'Submitted'} to S1 at ${formatSgTime(sub.submittedAt)}`);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Couldn't submit. Check your connection and try again.", { tone: 'error' });
      throw err;
    }
  };

  const cutoff = event ? { time: formatSgTime(event.cutoffAt), passed: now.getTime() >= Date.parse(event.cutoffAt) } : undefined;
  const reportPill = data ? <ReportPill state={data.submission} /> : null;

  if (!unitId) {
    return (
      <div className="page">
        <AppHeader title="No unit assigned" />
        <div className="page__content">
          <EmptyState icon="alert" title="Your account has no unit" text="Ask S1 to assign you to a unit before marking attendance." />
        </div>
      </div>
    );
  }

  return (
    <div className="page page--column">
      <AppHeader
        title={data?.unit.name ?? ' '}
        meta={formatSgDateLong(date)}
        actions={
          <>
            {me.user.role === 'ADMIN' ? (
              <Link to={`/admin?date=${date}${eventId ? `&event=${eventId}` : ''}`} className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}>
                <Icon name="chevronLeft" size={18} />
                Battalion
              </Link>
            ) : (
              <Link to="/roll" className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}>
                <Icon name="roll" size={18} />
                Manage roll
              </Link>
            )}
            <AccountButton onClick={() => setAccountOpen(true)} />
          </>
        }
      >
        <EventPicker
          date={date}
          events={events}
          selectedId={eventId}
          onSelect={(id) => setParam('event', id)}
          onDateChange={(d) => {
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.set('date', d);
              next.delete('event');
              return next;
            });
          }}
        />
      </AppHeader>

      <ConnectionBanner />
      {data?.locked && me.user.role !== 'ADMIN' && <LockedDateNotice date={formatSgDateLong(date)} />}

      <main className="page__content">
        {data && scopeCounts ? (
          <StrengthSummary
            counts={scopeCounts}
            label={scopeLabel ? `${scopeLabel} present` : 'Present strength'}
            report={reportPill}
            cutoff={cutoff}
            note={
              scopeLabel
                ? `${scopeLabel} · ${scopeCounts.unmarked > 0 ? `${scopeCounts.unmarked} not yet marked` : 'everyone marked'} · unit total ${data.counts.present} / ${data.counts.strength}`
                : data.counts.unmarked > 0
                  ? `${data.counts.unmarked} not yet marked. Tap Present or Not present on each row.`
                  : 'Everyone is marked.'
            }
            extra={platoon === ALL_PLATOONS ? <PlatoonBreakdown platoons={data.platoons} onSelect={setPlatoon} /> : null}
          />
        ) : (
          <SkeletonSummary />
        )}

        {data && platoon === ALL_PLATOONS && trendsQ.data && <UnitTrendCard trends={trendsQ.data} />}
        {data && <PlatoonPicker platoons={data.platoons} selected={platoon} onChange={setPlatoon} strength={data.counts.strength} />}
        <SearchField value={search} onChange={setSearch} />
        <FilterChips
          filter={filter}
          onChange={setFilter}
          total={scopeCounts?.strength ?? 0}
          absent={scopeCounts?.absent ?? 0}
          unmarked={scopeCounts?.unmarked ?? 0}
        />

        {attendanceQ.isPending ? (
          <SkeletonRows rows={8} />
        ) : attendanceQ.isError ? (
          <EmptyState
            icon="alert"
            title="Couldn't load the roll"
            text={attendanceQ.error instanceof ApiError ? attendanceQ.error.message : 'Check your connection and try again.'}
            action={<Button onClick={() => attendanceQ.refetch()}>Try again</Button>}
          />
        ) : allPersons.length === 0 ? (
          <EmptyState
            title="No personnel on the roll"
            text="Add your unit's personnel to start marking attendance."
            action={<Link to="/roll" className="btn btn--primary">Manage roll</Link>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="No one matches" text="Try another name or clear the filters." action={<Button onClick={() => { setSearch(''); setFilter('ALL'); }}>Clear filters</Button>} />
        ) : (
          <ul className="roll" aria-label={`Personnel, ${filtered.length} shown`}>
            {filtered.map((p) => (
              <PersonRow
                key={p.personId}
                person={p}
                eventDate={date}
                pending={pendingIds.has(p.personId)}
                disabled={readOnly}
                onOpen={(person: EffectiveStatus, notPresent?: boolean) => { setSheetNotPresent(!!notPresent); setSelectedId(person.personId); }}
                onPresent={(person: EffectiveStatus) => markPerson(person.personId, { action: 'PRESENT' })}
              />
            ))}
          </ul>
        )}
      </main>

      {data && me.user.role !== 'ADMIN' && (
        <SubmitFooter
          submission={data.submission}
          counts={data.counts}
          changes={data.changes}
          updatedAt={data.updatedAt}
          save={{ status: connection.status, pendingCount: connection.pendingCount }}
          locked={data.locked}
          busy={submit.isPending}
          bulkBusy={bulk.isPending}
          onSubmit={onSubmit}
          onMarkRemainingPresent={onMarkRemainingPresent}
        />
      )}

      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
      <StatusSheet person={readOnly ? null : selected} startNotPresent={sheetNotPresent} eventDate={date} eventLabel={event?.label ?? 'this event'} onSave={onSave} onClose={() => setSelectedId(null)} />
    </div>
  );
}

export function ReportPill({ state }: { state: import('@shared/types').SubmissionState }) {
  switch (state.kind) {
    case 'NOT_MARKED': return <StatusPill tone="neutral">Not submitted</StatusPill>;
    case 'PENDING': return <StatusPill tone="pending" dot>Not submitted</StatusPill>;
    case 'LATE': return <StatusPill tone="danger" dot>Late · not submitted</StatusPill>;
    case 'SUBMITTED':
      return <StatusPill tone={state.hasChanges ? 'warn' : 'ok'} dot>{state.hasChanges ? 'Changes since submission' : `Submitted ${formatSgTime(state.submittedAt)}`}</StatusPill>;
    case 'RESUBMITTED':
      return <StatusPill tone={state.hasChanges ? 'warn' : 'ok'} dot>{state.hasChanges ? 'Changes since submission' : `Resubmitted v${state.version} · ${formatSgTime(state.submittedAt)}`}</StatusPill>;
  }
}
