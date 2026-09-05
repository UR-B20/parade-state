import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatSgDateLong, formatSgTime, isIsoDate, sgDateOf } from '@shared/dates';
import { ApiError } from '../../api/client';
import { keys } from '../../api/keys';
import { useApi } from '../../api/provider';
import { useSettings } from '../../api/queries';
import { useAuth } from '../../state/auth';
import { AccountButton, AccountMenu } from '../../components/AccountMenu';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { SkeletonRows } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import '../../components/Dialog.css';
import '../pages.css';

export function SettingsPage() {
  const me = useAuth();
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const settingsQ = useSettings(true);
  const [am, setAm] = useState<string | null>(null);
  const [pm, setPm] = useState<string | null>(null);
  const [unlockDate, setUnlockDate] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const today = sgDateOf(new Date(me.demo.now ?? me.serverNow));
  const onError = (err: unknown) => toast.show(err instanceof ApiError ? err.message : 'Something went wrong.', { tone: 'error' });
  const done = () => { void qc.invalidateQueries({ queryKey: keys.settings }); void qc.invalidateQueries({ queryKey: ['events'] }); };

  const saveCutoffs = useMutation({
    mutationFn: () => api.updateSettings({ cutoffAm: am ?? undefined, cutoffPm: pm ?? undefined }),
    onSuccess: () => { done(); toast.show('Cut-offs saved. They apply to dates created from now on.'); setAm(null); setPm(null); },
    onError,
  });
  const unlock = useMutation({ mutationFn: (d: string) => api.unlockDate(d), onSuccess: (_s, d) => { done(); toast.show(`${formatSgDateLong(d)} unlocked for 24 hours`); setUnlockDate(''); }, onError });
  const relock = useMutation({ mutationFn: (d: string) => api.relockDate(d), onSuccess: () => { done(); toast.show('Date locked again'); }, onError });

  const s = settingsQ.data;
  const cutoffsDirty = (am !== null && am !== s?.cutoffAm) || (pm !== null && pm !== s?.cutoffPm);
  const unlockValid = isIsoDate(unlockDate) && unlockDate < today;

  return (
    <div className="page page--column">
      <AppHeader
        title="Cut-offs and unlocks"
        actions={
          <>
            <Link to="/admin" className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}><Icon name="chevronLeft" size={18} /> Battalion</Link>
            <AccountButton onClick={() => setAccountOpen(true)} />
          </>
        }
      />
      <main className="page__content">
        {!s ? (
          <SkeletonRows rows={3} />
        ) : (
          <>
            <section className="roll" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="cutoff-title">
              <h2 id="cutoff-title" className="dialog__title" style={{ fontSize: 'var(--fs-body-lg)' }}>Submission cut-offs</h2>
              <p className="dialog__muted">Units become Late after the cut-off. Changes apply to parade dates created from now on.</p>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">AM parade</span>
                  <input className="field__input num" type="time" value={am ?? s.cutoffAm} onChange={(e) => setAm(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field__label">PM parade</span>
                  <input className="field__input num" type="time" value={pm ?? s.cutoffPm} onChange={(e) => setPm(e.target.value)} />
                </label>
              </div>
              <Button variant="primary" disabled={!cutoffsDirty} busy={saveCutoffs.isPending} onClick={() => saveCutoffs.mutate()}>Save cut-offs</Button>
            </section>

            <section className="roll" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="unlock-title">
              <h2 id="unlock-title" className="dialog__title" style={{ fontSize: 'var(--fs-body-lg)' }}>Unlock a past date</h2>
              <p className="dialog__muted">Commanders can only mark today and future dates. Unlock a past date for 24 hours when a correction is needed.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field__input num" type="date" max={today} value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} aria-label="Date to unlock" />
                <Button variant="primary" disabled={!unlockValid} busy={unlock.isPending} onClick={() => unlock.mutate(unlockDate)}>Unlock</Button>
              </div>
              {s.dateUnlocks.length > 0 && (
                <ul className="roll">
                  {s.dateUnlocks.map((u) => (
                    <li key={u.date} className="absentee">
                      <div className="absentee__main">
                        <span className="absentee__name">{formatSgDateLong(u.date)}</span>
                        <span className="absentee__meta num">Unlocked until {formatSgTime(u.expiresAt)}{sgDateOf(u.expiresAt) !== today ? ` tomorrow` : ''}</span>
                      </div>
                      <Button small onClick={() => relock.mutate(u.date)} busy={relock.isPending && relock.variables === u.date}>Lock</Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
