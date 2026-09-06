import { useParams } from 'react-router-dom';
import { formatSgDateLong } from '@shared/dates';
import { useAttendance, useMe, useSubmissions } from '../api/queries';
import { Spinner, TopBar } from '../components/ui';
import { formatWhen } from '../format';

export function HistoryPage() {
  const { unitId = '', eventId = '' } = useParams();
  const me = useMe();
  const attendance = useAttendance(unitId, eventId);
  const history = useSubmissions(unitId, eventId);
  const back = `/units/${unitId}/events/${eventId}`;
  const event = attendance.data?.event;
  const today = me.data?.sgToday ?? eventId.slice(0, 10);
  return (
    <>
      <TopBar title="Submission history" subtitle={event ? `${attendance.data?.unit.name} · ${formatSgDateLong(event.date)} · ${event.label}` : undefined} back={back} />
      <main className="screen">
        {history.isPending && !history.data && <Spinner />}
        {history.data && history.data.submissions.length === 0 && <p className="empty">Nothing submitted for this parade yet.</p>}
        {history.data && history.data.submissions.length > 0 && (
          <div className="card card--flush">
            <ul className="list" data-testid="history-list">
              {history.data.submissions.map((s) => (
                <li key={s.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <span className="list-row__main">
                    <span className="list-row__title">Version {s.version}</span>
                    <span className="list-row__sub">
                      {formatWhen(s.submittedAt, today)} by {s.submittedByName}
                    </span>
                  </span>
                  <span className="list-row__aside num muted" style={{ fontSize: 'var(--text-s)' }}>
                    {s.counts.present}/{s.counts.strength} present
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </>
  );
}
