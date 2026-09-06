import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatSgDateLong, formatSgTime } from '@shared/dates';
import { useAttendance, useMe, usePendingCount, useSubmitUnit } from '../api/queries';
import { Banner, Spinner, TopBar } from '../components/ui';
import { submissionSummary, tupleLabel } from '../format';

export function ReviewPage() {
  const { unitId = '', eventId = '' } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const attendance = useAttendance(unitId, eventId);
  const submit = useSubmitUnit(unitId, eventId);
  const pending = usePendingCount(unitId, eventId);
  const [busy, setBusy] = useState(false);
  const data = attendance.data;
  if (!data) return <Spinner />;

  const today = me.data?.sgToday ?? data.event.date;
  const now = me.data?.serverNow ?? new Date().toISOString();
  const summary = submissionSummary(data.submission, today);
  const latest = data.submission.kind === 'SUBMITTED' || data.submission.kind === 'RESUBMITTED' ? data.submission : null;
  const submitted = latest !== null;
  const nothingNew = latest !== null && !latest.hasChanges && pending === 0;
  const pastCutoff = Date.parse(now) >= Date.parse(data.event.cutoffAt);
  const c = data.counts;
  const back = `/units/${unitId}/events/${eventId}`;

  async function onSubmit() {
    setBusy(true);
    try {
      await submit.mutateAsync({});
      navigate(back, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Review and submit" subtitle={`${data.unit.name} · ${formatSgDateLong(data.event.date)} · ${data.event.label}`} back={back} />
      <main className="screen screen--has-actionbar">
        <Banner tone={summary.tone} title={summary.title}>
          {summary.detail}
        </Banner>
        {pastCutoff && !submitted && (
          <Banner tone="danger" title="Past cutoff">
            Cutoff was {formatSgTime(data.event.cutoffAt)}. This submission will be marked late.
          </Banner>
        )}
        {data.locked && (
          <Banner tone="info" title="Read only">
            This date is locked.
          </Banner>
        )}

        <section className="card stack stack--tight" aria-label="Summary">
          <h2>What S1 will receive</h2>
          <dl className="stack stack--tight" style={{ margin: 0 }}>
            <div className="row row--between">
              <dt className="muted">Strength</dt>
              <dd className="num" style={{ margin: 0 }}>{c.strength}</dd>
            </div>
            <div className="row row--between">
              <dt className="muted">Present</dt>
              <dd className="num" style={{ margin: 0 }}>
                {c.present}
                {c.presentDefault > 0 && <span className="muted"> ({c.presentDefault} unconfirmed)</span>}
              </dd>
            </div>
            {(['mc', 'll', 'ma', 'rsi', 'others'] as const).map((k) => (
              <div key={k} className="row row--between">
                <dt className="muted">{k.toUpperCase() === 'OTHERS' ? 'Others' : k.toUpperCase()}</dt>
                <dd className="num" style={{ margin: 0 }}>{c[k]}</dd>
              </div>
            ))}
            <div className="row row--between" style={{ fontWeight: 700 }}>
              <dt>Absent</dt>
              <dd className="num" style={{ margin: 0 }}>{c.absent}</dd>
            </div>
          </dl>
        </section>

        {latest && (
          <section className="card card--flush" aria-label="Changes since last submission">
            <div style={{ padding: '12px 16px' }}>
              <h2>Changes since v{latest.version}</h2>
            </div>
            {data.changes.length === 0 ? (
              <p className="empty">No changes since the last submission.</p>
            ) : (
              <ul className="list">
                {data.changes.map((ch) => (
                  <li key={ch.personId} className="diff-row">
                    <span className="list-row__title">
                      <span className="list-row__rank">{ch.rank}</span>
                      <span>{ch.name}</span>
                    </span>
                    <span className="diff-row__change">
                      <span className="muted">{tupleLabel(ch.before, today)}</span>
                      <span aria-hidden="true">→</span>
                      <span>{tupleLabel(ch.after, today)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {c.presentDefault > 0 && (
          <p className="muted" style={{ fontSize: 'var(--text-s)' }}>
            {c.presentDefault} {c.presentDefault === 1 ? 'person is' : 'people are'} Present by default. They count as present; confirming is optional.
          </p>
        )}
      </main>

      <div className="actionbar">
        <button type="button" className="btn btn--primary" disabled={busy || data.locked || nothingNew} onClick={() => void onSubmit()} data-testid="submit-button">
          {busy ? 'Submitting…' : latest ? `Resubmit as v${latest.version + 1}` : 'Submit to S1'}
        </button>
      </div>
    </>
  );
}
