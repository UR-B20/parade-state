import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as v from 'valibot';
import { formatSgDateShort, sgDateOf } from '@shared/dates';
import { RANK_ORDER } from '@shared/ranks';
import { CreatePersonSchema, firstIssue } from '@shared/schemas';
import type { PersonDto } from '@shared/types';
import { ApiError, type CreatePersonBody } from '../../api/client';
import { keys } from '../../api/keys';
import { useApi } from '../../api/provider';
import { usePersonnel } from '../../api/queries';
import { useAuth } from '../../state/auth';
import { AccountButton, AccountMenu } from '../../components/AccountMenu';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { SearchField } from '../../components/SearchField';
import { Sheet } from '../../components/Sheet';
import { SkeletonRows } from '../../components/Skeleton';
import { StatusPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import '../pages.css';

const ranks = [...RANK_ORDER].reverse();

export function RollPage({ unitId: unitIdProp }: { unitId?: string } = {}) {
  const me = useAuth();
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const unitId = unitIdProp ?? me.user.unitId;
  const [showInactive, setShowInactive] = useState(false);
  const rollQ = usePersonnel(unitId, showInactive);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PersonDto | 'new' | null>(null);
  const [postingOut, setPostingOut] = useState<PersonDto | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const today = sgDateOf(new Date(me.demo.now ?? me.serverNow));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['personnel', unitId] });
    void qc.invalidateQueries({ queryKey: ['attendance', unitId] });
  };

  const save = useMutation({
    mutationFn: (input: { id?: string; body: CreatePersonBody }) =>
      input.id ? api.updatePerson(unitId!, input.id, { rank: input.body.rank, name: input.body.name, serviceNo: input.body.serviceNo ?? null }) : api.createPerson(unitId!, input.body),
    onSuccess: (_p, input) => { invalidate(); toast.show(input.id ? 'Saved' : 'Added to the roll'); setEditing(null); },
  });
  const postOut = useMutation({
    mutationFn: (p: PersonDto) => api.updatePerson(unitId!, p.id, { postedOutDate: p.postedOutDate ? null : today }),
    onSuccess: (p) => { invalidate(); toast.show(p.postedOutDate ? `${p.name} posted out` : `${p.name} is back on strength`); setPostingOut(null); },
    onError: (err) => toast.show(err instanceof ApiError ? err.message : "Couldn't update.", { tone: 'error' }),
  });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rollQ.data ?? []).filter((p) => !q || `${p.rank} ${p.name}`.toLowerCase().includes(q));
  }, [rollQ.data, search]);

  if (!unitId) return <EmptyState icon="alert" title="Your account has no unit" />;

  return (
    <div className="page page--column">
      <AppHeader
        title="Manage roll"
        meta={rollQ.data ? `${rollQ.data.filter((p) => !p.postedOutDate).length} on strength` : undefined}
        actions={
          <>
            <Link to={me.user.role === 'ADMIN' ? `/admin/units/${unitId}` : '/mark'} className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}>
              <Icon name="chevronLeft" size={18} /> Attendance
            </Link>
            <AccountButton onClick={() => setAccountOpen(true)} />
          </>
        }
      />
      <main className="page__content">
        <SearchField value={search} onChange={setSearch} />
        <div className="filters">
          <button type="button" className="chip" aria-pressed={!showInactive} onClick={() => setShowInactive(false)}>On strength</button>
          <button type="button" className="chip" aria-pressed={showInactive} onClick={() => setShowInactive(true)}>Include posted out</button>
        </div>
        {rollQ.isPending ? (
          <SkeletonRows />
        ) : rollQ.isError ? (
          <EmptyState icon="alert" title="Couldn't load the roll" action={<Button onClick={() => rollQ.refetch()}>Try again</Button>} />
        ) : list.length === 0 ? (
          <EmptyState title={search ? 'No one matches' : 'No personnel yet'} text={search ? 'Try another name.' : 'Add the first person to your unit.'} action={!search && <Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Add person</Button>} />
        ) : (
          <ul className="roll" aria-label="Personnel">
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" className="person" onClick={() => setEditing(p)} aria-label={`Edit ${p.rank} ${p.name}`}>
                  <span className="person__main">
                    <span className="person__name truncate">{p.name}</span>
                    <span className="person__meta">
                      <span className="person__rank">{p.rank}</span>
                      <span className="person__detail truncate num">
                        {p.postedOutDate ? `Posted out ${formatSgDateShort(p.postedOutDate, today)}` : `Since ${formatSgDateShort(p.postedInDate, today)}`}
                        {p.serviceNo ? ` · ${p.serviceNo}` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="person__side">
                    {p.postedOutDate ? <StatusPill tone="neutral">Posted out</StatusPill> : <Icon name="chevronRight" size={18} style={{ color: 'var(--text-3)' }} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <Button variant="primary" block onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Add person
          </Button>
        </div>
      </footer>

      <PersonSheet
        person={editing}
        busy={save.isPending}
        onClose={() => setEditing(null)}
        onSave={(body, id) => save.mutate({ id, body }, { onError: (err) => toast.show(err instanceof ApiError ? err.message : "Couldn't save.", { tone: 'error' }) })}
        onPostOut={(p) => { setEditing(null); setPostingOut(p); }}
      />
      <ConfirmDialog
        open={!!postingOut}
        title={postingOut?.postedOutDate ? 'Return to strength?' : 'Post out?'}
        confirmLabel={postingOut?.postedOutDate ? 'Return to strength' : 'Post out'}
        danger={!postingOut?.postedOutDate}
        busy={postOut.isPending}
        onConfirm={() => postingOut && postOut.mutate(postingOut)}
        onCancel={() => setPostingOut(null)}
      >
        <p className="dialog__text">
          {postingOut?.postedOutDate
            ? `${postingOut.rank} ${postingOut.name} will count towards strength again from today.`
            : `${postingOut?.rank} ${postingOut?.name} leaves the roll from today. Past parades keep their record.`}
        </p>
      </ConfirmDialog>
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

function PersonSheet({ person, busy, onClose, onSave, onPostOut }: { person: PersonDto | 'new' | null; busy: boolean; onClose: () => void; onSave: (body: CreatePersonBody, id?: string) => void; onPostOut: (p: PersonDto) => void }) {
  const isNew = person === 'new';
  const existing = person && person !== 'new' ? person : null;
  const [rank, setRank] = useState(existing?.rank ?? 'PTE');
  const [name, setName] = useState(existing?.name ?? '');
  const [serviceNo, setServiceNo] = useState(existing?.serviceNo ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);

  // Reset the form when a different person opens.
  const currentKey = person === null ? null : isNew ? 'new' : existing!.id;
  if (currentKey !== key) {
    setKey(currentKey);
    setRank(existing?.rank ?? 'PTE');
    setName(existing?.name ?? '');
    setServiceNo(existing?.serviceNo ?? '');
    setErrors({});
  }

  const submit = () => {
    const parsed = v.safeParse(CreatePersonSchema, { rank, name, serviceNo: serviceNo.trim() || null });
    if (!parsed.success) return setErrors(firstIssue(parsed.issues));
    onSave(parsed.output, existing?.id);
  };

  return (
    <Sheet
      open={person !== null}
      onClose={onClose}
      title={isNew ? 'Add person' : `${existing?.rank} ${existing?.name}`}
      subtitle={isNew ? 'Joins the roll on strength from today.' : undefined}
      footer={
        <>
          <Button variant="primary" block busy={busy} onClick={submit}>{isNew ? 'Add to roll' : 'Save'}</Button>
          {existing && (
            <Button variant={existing.postedOutDate ? 'ghost' : 'danger-ghost'} block onClick={() => onPostOut(existing)}>
              {existing.postedOutDate ? 'Return to strength' : 'Post out'}
            </Button>
          )}
        </>
      }
    >
      <label className="field">
        <span className="field__label">Rank</span>
        <select className="field__input" value={rank} onChange={(e) => setRank(e.target.value)} aria-invalid={!!errors['rank'] || undefined}>
          {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {errors['rank'] && <span className="field__error" role="alert">{errors['rank']}</span>}
      </label>
      <label className="field">
        <span className="field__label">Name</span>
        <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-invalid={!!errors['name'] || undefined} placeholder="As on the nominal roll" />
        {errors['name'] && <span className="field__error" role="alert">{errors['name']}</span>}
      </label>
      <label className="field">
        <span className="field__label">Service number (optional)</span>
        <input className="field__input" value={serviceNo} onChange={(e) => setServiceNo(e.target.value)} autoComplete="off" />
        {errors['serviceNo'] && <span className="field__error" role="alert">{errors['serviceNo']}</span>}
      </label>
    </Sheet>
  );
}
