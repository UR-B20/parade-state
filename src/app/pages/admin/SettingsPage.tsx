import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatSgDateLong, formatSgTime, isIsoDate, sgDateOf } from '@shared/dates';
import { ApiError } from '../../api/client';
import { keys } from '../../api/keys';
import { useApi } from '../../api/provider';
import { useArchivedEvents, useSettings, useUnits } from '../../api/queries';
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
  const unitsQ = useUnits();
  const archivedQ = useArchivedEvents(true);
  const [newPlatoon, setNewPlatoon] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [am, setAm] = useState<string | null>(null);
  const [pm, setPm] = useState<string | null>(null);
  const [unlockDate, setUnlockDate] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const today = sgDateOf(new Date(me.demo.now ?? me.serverNow));
  const onError = (err: unknown) => toast.show(err instanceof ApiError ? err.message : 'Something went wrong.', { tone: 'error' });
  const done = () => { void qc.invalidateQueries({ queryKey: keys.settings }); void qc.invalidateQueries({ queryKey: ['events'] }); };
  const platoonDone = () => { void qc.invalidateQueries({ queryKey: keys.units }); void qc.invalidateQueries({ queryKey: ['summary'] }); };
  const addPlatoon = useMutation({ mutationFn: (v: { unitId: string; name: string }) => api.createPlatoon(v.unitId, v.name), onSuccess: (_p, v) => { platoonDone(); setNewPlatoon((m) => ({ ...m, [v.unitId]: '' })); toast.show('Platoon added'); }, onError });
  const renamePlatoon = useMutation({ mutationFn: (v: { id: string; name: string }) => api.renamePlatoon(v.id, v.name), onSuccess: () => { platoonDone(); setRenaming(null); toast.show('Platoon renamed'); }, onError });
  const removePlatoon = useMutation({ mutationFn: (id: string) => api.deletePlatoon(id), onSuccess: () => { platoonDone(); toast.show('Platoon removed'); }, onError });

  const saveCutoffs = useMutation({
    mutationFn: () => api.updateSettings({ cutoffAm: am ?? undefined, cutoffPm: pm ?? undefined }),
    onSuccess: () => { done(); toast.show('Cut-offs saved. They apply to dates created from now on.'); setAm(null); setPm(null); },
    onError,
  });
  const unlock = useMutation({ mutationFn: (d: string) => api.unlockDate(d), onSuccess: (_s, d) => { done(); toast.show(`${formatSgDateLong(d)} unlocked for 24 hours`); setUnlockDate(''); }, onError });
  const relock = useMutation({ mutationFn: (d: string) => api.relockDate(d), onSuccess: () => { done(); toast.show('Date locked again'); }, onError });
  const restore = useMutation({ mutationFn: (id: string) => api.restoreEvent(id), onSuccess: (ev) => { void qc.invalidateQueries({ queryKey: ['events'] }); toast.show(`${ev.label} restored`); }, onError });

  const s = settingsQ.data;
  const cutoffsDirty = (am !== null && am !== s?.cutoffAm) || (pm !== null && pm !== s?.cutoffPm);
  const unlockValid = isIsoDate(unlockDate) && unlockDate < today;

  return (
    <div className="page page--column">
      <AppHeader
        title="Cut-offs and unlocks"
        actions={
          <>
            <Link to="/admin" className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}><Icon name="chevronLeft" size={18} /> 15C4I Battalion</Link>
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

            <section className="roll" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="platoon-title">
              <h2 id="platoon-title" className="dialog__title" style={{ fontSize: 'var(--fs-body-lg)' }}>Platoons</h2>
              <p className="dialog__muted">Companies report by platoon. Staff units have no platoons. Commanders assign personnel to a platoon in Manage roll.</p>
              {(unitsQ.data ?? []).filter((u) => u.id.startsWith('COY') || u.id === 'ISR' || u.platoons.length > 0).map((u) => (
                <div key={u.id} className="field">
                  <span className="field__label">{u.name}</span>
                  <ul className="roll">
                    {u.platoons.map((p) => (
                      <li key={p.id} className="absentee" style={{ minHeight: 52 }}>
                        {renaming?.id === p.id ? (
                          <>
                            <input className="field__input" value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} aria-label="Platoon name" />
                            <Button small variant="primary" busy={renamePlatoon.isPending} onClick={() => renamePlatoon.mutate(renaming)}>Save</Button>
                            <Button small variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <span className="absentee__main"><span className="absentee__name">{p.name}</span></span>
                            <Button small variant="ghost" onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</Button>
                            <Button small variant="danger-ghost" busy={removePlatoon.isPending && removePlatoon.variables === p.id} onClick={() => removePlatoon.mutate(p.id)}>Remove</Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="field__input" placeholder={`New platoon in ${u.name}`} value={newPlatoon[u.id] ?? ''} onChange={(e) => setNewPlatoon((m) => ({ ...m, [u.id]: e.target.value }))} aria-label={`New platoon in ${u.name}`} />
                    <Button disabled={!(newPlatoon[u.id] ?? '').trim()} busy={addPlatoon.isPending && addPlatoon.variables?.unitId === u.id} onClick={() => addPlatoon.mutate({ unitId: u.id, name: (newPlatoon[u.id] ?? '').trim() })}>Add</Button>
                  </div>
                </div>
              ))}
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

            <section className="roll" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="archived-title">
              <h2 id="archived-title" className="dialog__title" style={{ fontSize: 'var(--fs-body-lg)' }}>Archived ad hoc events</h2>
              <p className="dialog__muted">Archive an ad hoc event from the battalion dashboard once it is over. Archived events are hidden from everyone but keep their submissions; restore one to bring it back.</p>
              {archivedQ.isPending ? (
                <SkeletonRows rows={2} />
              ) : (archivedQ.data ?? []).length === 0 ? (
                <p className="dialog__muted">No archived events.</p>
              ) : (
                <ul className="roll">
                  {archivedQ.data!.map((ev) => (
                    <li key={ev.id} className="absentee">
                      <div className="absentee__main">
                        <span className="absentee__name">{ev.label}</span>
                        <span className="absentee__meta num">{formatSgDateLong(ev.date)}{ev.archivedAt ? ` · archived ${formatSgDateLong(sgDateOf(ev.archivedAt))}` : ''}</span>
                      </div>
                      <Button small onClick={() => restore.mutate(ev.id)} busy={restore.isPending && restore.variables === ev.id}>Restore</Button>
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
