import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDays, formatSgDateLong, formatSgTime } from '@shared/dates';
import { STATUSES, STATUS_LABEL, type Status } from '@shared/statuses';
import type { EffectiveStatus, UnitAttendanceDto } from '@shared/types';
import { useAttendance, useEvents, useMarkPerson, useMe, usePendingCount } from '../api/queries';
import { MarkSheet } from '../components/MarkSheet';
import { Banner, Spinner, StatusChip, Toast, TopBar } from '../components/ui';
import { formatSpan, statusLabel, submissionSummary } from '../format';
import { useBackend } from '../providers';

function CountsStrip({ data }: { data: UnitAttendanceDto }) {
  const c = data.counts;
  return (
    <div className="stack stack--tight">
      <div className="counts" data-testid="counts">
        <div className="counts__tile">
          <span className="counts__label">Strength</span>
          <span className="counts__value">{c.strength}</span>
        </div>
        <div className="counts__tile">
          <span className="counts__label">Present</span>
          <span className="counts__value" data-testid="count-present">{c.present}</span>
          <span className="counts__hint">{c.presentDefault > 0 ? `${c.presentDefault} unconfirmed` : 'all confirmed'}</span>
        </div>
        <div className="counts__tile">
          <span className="counts__label">Absent</span>
          <span className="counts__value" data-testid="count-absent">{c.absent}</span>
        </div>
      </div>
      <div className="breakdown">
        {(['MC', 'LL', 'MA', 'RSI', 'OTHERS'] as const).map((s) => (
          <StatusChip key={s} status={s} label={`${STATUS_LABEL[s]} ${c[s.toLowerCase() as 'mc' | 'll' | 'ma' | 'rsi' | 'others']}`} />
        ))}
      </div>
    </div>
  );
}

function PersonRow({ p, today, onOpen, onConfirm, locked }: { p: EffectiveStatus; today: string; onOpen: () => void; onConfirm: () => void; locked: boolean }) {
  const isDefault = p.status === 'PRESENT' && !p.confirmed;
  const sub = p.status === 'PRESENT' ? (isDefault ? 'Present by default · tap to confirm' : 'Confirmed present') : [formatSpan(p.startDate, p.endDate, today), p.remark].filter(Boolean).join(' · ');
  return (
    <li>
      <div className="list-row" data-testid={`person-${p.personId}`}>
        <button type="button" className="list-row__main" onClick={onOpen} style={{ textAlign: 'left' }} aria-label={`${p.rank} ${p.name}, ${statusLabel(p.status, p.subType)}`}>
          <span className="list-row__title">
            <span className="list-row__rank">{p.rank}</span>
            <span>{p.name}</span>
          </span>
          <span className="list-row__sub">{sub}</span>
        </button>
        <span className="list-row__aside">
          {p.status === 'PRESENT' ? (
            isDefault && !locked ? (
              <button type="button" className="btn btn--small btn--ghost" onClick={onConfirm} aria-label={`Confirm ${p.name} present`}>
                Confirm
              </button>
            ) : (
              <StatusChip status="PRESENT" label="Present" muted={isDefault} />
            )
          ) : (
            <StatusChip status={p.status} label={statusLabel(p.status, p.subType)} />
          )}
        </span>
      </div>
    </li>
  );
}

export function RollPage() {
  const { unitId = '', eventId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useBackend();
  const me = useMe();
  const attendance = useAttendance(unitId, eventId);
  const date = attendance.data?.event.date ?? eventId.slice(0, 10);
  const events = useEvents(date);
  const mark = useMarkPerson(unitId, eventId);
  const pending = usePendingCount(unitId, eventId);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const data = attendance.data;
  const today = me.data?.sgToday ?? date;
  const bands = useMemo(() => {
    const groups = new Map<Status, EffectiveStatus[]>(STATUSES.map((s) => [s, []]));
    for (const p of data?.persons ?? []) groups.get(p.status)!.push(p);
    return [...groups.entries()].filter(([, list]) => list.length > 0);
  }, [data]);

  if (!data && attendance.isPending) return <Spinner />;
  if (!data) {
    return (
      <>
        <TopBar title={unitId} back="/" />
        <main className="screen">
          <Banner tone="danger" title="Could not load the roll">
            {attendance.error instanceof Error ? attendance.error.message : 'Check your connection.'}
          </Banner>
          <button type="button" className="btn btn--primary" onClick={() => attendance.refetch()}>
            Try again
          </button>
        </main>
      </>
    );
  }

  const summary = submissionSummary(data.submission, today);
  const selectedPerson = selected ? data.persons.find((p) => p.personId === selected) ?? null : null;
  const changeCount = data.changes.length;
  const goToDate = (d: string) => navigate(`/units/${unitId}/events/${d}-${data.event.type === 'ADHOC' ? 'AM' : data.event.type}`);

  return (
    <>
      <TopBar
        title={data.unit.name}
        subtitle={`${formatSgDateLong(data.event.date)} · ${data.event.label}`}
        right={
          <button type="button" className="btn btn--text" onClick={() => void session.signOut()}>
            Sign out
          </button>
        }
      />
      <main className="screen screen--has-actionbar">
        <div className="date-nav">
          <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => goToDate(addDays(date, -1))}>
            ‹
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && goToDate(e.target.value)} aria-label="Parade date" />
          <button type="button" className="icon-btn" aria-label="Next day" onClick={() => goToDate(addDays(date, 1))}>
            ›
          </button>
        </div>
        <nav className="event-tabs" aria-label="Parade">
          {(events.data?.events ?? [data.event]).map((e) => (
            <Link key={e.id} to={`/units/${unitId}/events/${e.id}`} className="event-tab" aria-current={e.id === data.event.id ? 'page' : undefined}>
              {e.label} · {formatSgTime(e.cutoffAt)}
            </Link>
          ))}
        </nav>

        <Banner tone={summary.tone} title={summary.title}>
          {summary.detail}
          {pending > 0 && ` ${pending} change${pending === 1 ? '' : 's'} on this phone not yet sent.`}
        </Banner>
        {data.locked && (
          <Banner tone="info" title="Read only">
            This date is in the past. Ask S1 to unlock it if something needs correcting.
          </Banner>
        )}

        <CountsStrip data={data} />

        <div className="card card--flush">
          {bands.map(([status, list]) => (
            <section key={status} className={`band st-${status}`} aria-label={STATUS_LABEL[status]}>
              <header className="band__head">
                <span>{STATUS_LABEL[status]}</span>
                <span className="num">{list.length}</span>
              </header>
              <ul className="list">
                {list.map((p) => (
                  <PersonRow
                    key={p.personId}
                    p={p}
                    today={today}
                    locked={data.locked}
                    onOpen={() => !data.locked && setSelected(p.personId)}
                    onConfirm={() => mark.mutate({ personId: p.personId, body: { action: 'PRESENT' } })}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <Link to={`/units/${unitId}/events/${eventId}/history`} className="btn btn--text" style={{ alignSelf: 'center' }}>
          Submission history
        </Link>
      </main>

      <div className="actionbar">
        <Link to={`/units/${unitId}/events/${eventId}/review`} className="btn btn--primary" aria-disabled={data.locked} onClick={(e) => data.locked && e.preventDefault()} data-testid="review-button">
          Review and submit
          {changeCount > 0 && <span className="badge">{changeCount}</span>}
        </Link>
      </div>

      {selectedPerson && (
        <MarkSheet
          person={selectedPerson}
          eventDate={data.event.date}
          today={today}
          onClose={() => setSelected(null)}
          onSave={(body) => {
            mark.mutate({ personId: selectedPerson.personId, body });
            setSelected(null);
            setToast(`${selectedPerson.name}: ${body.action === 'SET' ? statusLabel(body.status, body.subType ?? null) : 'Present'}`);
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
