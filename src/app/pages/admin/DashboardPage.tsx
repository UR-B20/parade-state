import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { formatSgDateLong, formatSgTime, sgDateOf, type IsoDate } from '@shared/dates';
import { awaitingRank, isSubmitted } from '@shared/domain';
import type { UnitSummaryRow } from '@shared/types';
import { useAbsentees, useEvents, useNotifications, useSummary } from '../../api/queries';
import { useAuth } from '../../state/auth';
import { AbsenteeList } from '../../components/AbsenteeList';
import { AccountButton, AccountMenu } from '../../components/AccountMenu';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ComparisonTable } from '../../components/ComparisonTable';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { EmptyState } from '../../components/EmptyState';
import { EventPicker } from '../../components/EventPicker';
import { ExportMenu } from '../../components/ExportMenu';
import { NotificationsButton, NotificationsPanel } from '../../components/NotificationsPanel';
import { SkeletonRows, SkeletonSummary } from '../../components/Skeleton';
import { StatusPill } from '../../components/StatusPill';
import { StrengthSummary } from '../../components/StrengthSummary';
import { Tabs } from '../../components/Tabs';
import { UnitRow } from '../../components/UnitRow';
import { ApiError } from '../../api/client';
import '../pages.css';

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function DashboardPage() {
  const me = useAuth();
  const now = useMemo(() => new Date(me.demo.now ?? me.serverNow), [me.demo.now, me.serverNow]);
  const today = sgDateOf(now);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab = location.pathname.endsWith('/absentees') ? 'absentees' : 'units';

  const date: IsoDate = params.get('date') ?? today;
  const eventsQ = useEvents(date);
  const events = eventsQ.data;
  const defaultEventId = useMemo(() => {
    if (!events) return null;
    const hour = Number(formatSgTime(now).slice(0, 2));
    const wantPm = date === today && hour >= 12;
    return (events.find((e) => e.type === (wantPm ? 'PM' : 'AM')) ?? events[0])?.id ?? null;
  }, [events, now, date, today]);
  const eventId = params.get('event') ?? defaultEventId;

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);

  const summaryQ = useSummary(eventId);
  const absenteesQ = useAbsentees(tab === 'absentees' ? eventId : null);
  const notifQ = useNotifications(true);
  const summary = summaryQ.data;
  const event = summary?.event ?? events?.find((e) => e.id === eventId) ?? null;
  const wide = useIsWide();

  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const groups = useMemo(() => {
    if (!summary) return { awaiting: [] as UnitSummaryRow[], submitted: [] as UnitSummaryRow[] };
    const awaiting = summary.units.filter((u) => !isSubmitted(u.submission)).sort((a, b) => awaitingRank(a.submission) - awaitingRank(b.submission) || a.unit.sortOrder - b.unit.sortOrder);
    const submitted = summary.units.filter((u) => isSubmitted(u.submission)).sort((a, b) => a.unit.sortOrder - b.unit.sortOrder);
    return { awaiting, submitted };
  }, [summary]);

  const cutoff = event ? { time: formatSgTime(event.cutoffAt), passed: now.getTime() >= Date.parse(event.cutoffAt) } : undefined;
  const query = `?date=${date}${eventId ? `&event=${eventId}` : ''}`;
  const fileStem = event ? `parade-state-${event.date}-${event.type === 'ADHOC' ? 'adhoc' : event.type}` : 'parade-state';

  return (
    <div className="page">
      <AppHeader
        title="Battalion"
        meta={formatSgDateLong(date)}
        wide
        actions={
          <>
            <NotificationsButton unread={notifQ.data?.unreadCount ?? 0} onClick={() => setNotifOpen(true)} />
            <AccountButton onClick={() => setAccountOpen(true)} />
          </>
        }
      >
        <EventPicker
          date={date}
          events={events}
          selectedId={eventId}
          onSelect={(id) => setParam('event', id)}
          onDateChange={(d) => setParams((p) => { const next = new URLSearchParams(p); next.set('date', d); next.delete('event'); return next; })}
        />
      </AppHeader>
      <ConnectionBanner />

      <main className={`page__content page__content--wide`}>
        <div className={wide ? 'admin-grid' : 'group'} style={wide ? undefined : { gap: 12 }}>
          <div className={wide ? 'admin-grid__side' : 'group'} style={wide ? undefined : { gap: 12 }}>
            {summary ? (
              <StrengthSummary
                counts={summary.totals}
                report={
                  <StatusPill tone={summary.unitsSubmitted === summary.unitsTotal ? 'ok' : cutoff?.passed ? 'danger' : 'pending'} dot>
                    {summary.unitsSubmitted} of {summary.unitsTotal} units submitted
                  </StatusPill>
                }
                cutoff={cutoff}
                note={
                  <span className="num">
                    {summary.totals.absent} absent · {summary.totals.presentDefault} not yet marked and counted as Present by default
                  </span>
                }
              />
            ) : (
              <SkeletonSummary />
            )}
          </div>

          <div className="group" style={{ gap: 12 }}>
            <Tabs
              label="Dashboard sections"
              activeId={tab}
              items={[
                { id: 'units', label: 'Units', count: summary?.unitsTotal, to: `/admin${query}` },
                { id: 'absentees', label: 'Absentees', count: summary?.totals.absent, to: `/admin/absentees${query}` },
              ]}
            />

            {tab === 'units' && (
              summaryQ.isPending ? (
                <SkeletonRows rows={8} />
              ) : summaryQ.isError || !summary ? (
                <EmptyState icon="alert" title="Couldn't load the battalion summary" text={summaryQ.error instanceof ApiError ? summaryQ.error.message : 'Check your connection and try again.'} action={<Button onClick={() => summaryQ.refetch()}>Try again</Button>} />
              ) : wide ? (
                <>
                  <ComparisonTable summary={summary} date={date} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {eventId && <ExportMenu eventId={eventId} fileStem={fileStem} inline />}
                  </div>
                </>
              ) : (
                <>
                  {groups.awaiting.length > 0 && (
                    <section className="group" aria-labelledby="awaiting-title">
                      <h2 id="awaiting-title" className="group__title">
                        <span>Awaiting submission</span>
                        <span className="num">{groups.awaiting.length}</span>
                      </h2>
                      <ul className="roll">
                        {groups.awaiting.map((r) => <UnitRow key={r.unit.id} row={r} eventId={eventId!} date={date} />)}
                      </ul>
                    </section>
                  )}
                  <section className="group" aria-labelledby="submitted-title">
                    <h2 id="submitted-title" className="group__title">
                      <span>Submitted</span>
                      <span className="num">{groups.submitted.length}</span>
                    </h2>
                    {groups.submitted.length === 0 ? (
                      <div className="roll"><EmptyState icon="clock" title="No submissions yet" text={cutoff ? `Units have until ${cutoff.time} to submit.` : undefined} /></div>
                    ) : (
                      <ul className="roll">
                        {groups.submitted.map((r) => <UnitRow key={r.unit.id} row={r} eventId={eventId!} date={date} />)}
                      </ul>
                    )}
                  </section>
                </>
              )
            )}

            {tab === 'absentees' && (
              absenteesQ.isPending ? (
                <SkeletonRows rows={6} />
              ) : absenteesQ.isError || !absenteesQ.data ? (
                <EmptyState icon="alert" title="Couldn't load absentees" action={<Button onClick={() => absenteesQ.refetch()}>Try again</Button>} />
              ) : absenteesQ.data.total === 0 ? (
                <div className="roll"><EmptyState icon="check" title="No absentees" text="Everyone in the battalion is present for this event." /></div>
              ) : (
                <AbsenteeList data={absenteesQ.data} />
              )
            )}
          </div>
        </div>

        {!wide && eventId && <ExportMenu eventId={eventId} fileStem={fileStem} />}
      </main>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} data={notifQ.data} today={today} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
