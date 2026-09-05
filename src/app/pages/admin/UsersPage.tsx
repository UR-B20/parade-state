import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as v from 'valibot';
import { CreateUserSchema, firstIssue, PasswordSchema } from '@shared/schemas';
import type { UnitDto, UserDto } from '@shared/types';
import { ApiError, type CreateUserBody } from '../../api/client';
import { keys } from '../../api/keys';
import { useApi } from '../../api/provider';
import { useUnits, useUsers } from '../../api/queries';
import { useAuth } from '../../state/auth';
import { AccountButton, AccountMenu } from '../../components/AccountMenu';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { SkeletonRows } from '../../components/Skeleton';
import { StatusPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import '../pages.css';

export function UsersPage() {
  const me = useAuth();
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const usersQ = useUsers(true);
  const unitsQ = useUnits();
  const [editing, setEditing] = useState<UserDto | 'new' | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.users });

  const create = useMutation({
    mutationFn: (body: CreateUserBody) => api.createUser(body),
    onSuccess: (u) => { void invalidate(); toast.show(`Account created for ${u.displayName}`); setEditing(null); },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; displayName?: string; unitId?: string | null; isActive?: boolean }) => api.updateUser(input.id, input),
    onSuccess: () => { void invalidate(); toast.show('Saved'); setEditing(null); },
  });
  const reset = useMutation({
    mutationFn: (input: { id: string; password: string }) => api.resetPassword(input.id, input.password),
    onSuccess: () => { void invalidate(); toast.show('Password reset. They must change it at next sign-in.'); setEditing(null); },
  });

  const unitName = (id: string | null) => unitsQ.data?.find((u) => u.id === id)?.name ?? id ?? '';
  const groups = useMemo(() => {
    const list = usersQ.data ?? [];
    return { admins: list.filter((u) => u.role === 'ADMIN'), commanders: list.filter((u) => u.role === 'COMMANDER').sort((a, b) => unitName(a.unitId).localeCompare(unitName(b.unitId))) };
  }, [usersQ.data, unitsQ.data]);

  const onError = (err: unknown) => toast.show(err instanceof ApiError ? err.message : 'Something went wrong.', { tone: 'error' });

  const renderUser = (u: UserDto) => (
    <li key={u.id}>
      <button type="button" className="person" onClick={() => setEditing(u)} aria-label={`Edit ${u.displayName}`}>
        <span className="person__main">
          <span className="person__name truncate">{u.displayName}</span>
          <span className="person__meta"><span className="person__detail truncate">{u.email}</span></span>
        </span>
        <span className="person__side">
          {!u.isActive ? <StatusPill tone="danger">Deactivated</StatusPill> : u.mustChangePassword ? <StatusPill tone="warn">Password pending</StatusPill> : u.role === 'COMMANDER' ? <StatusPill tone="neutral">{unitName(u.unitId)}</StatusPill> : <StatusPill tone="pending">S1 admin</StatusPill>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="page page--column">
      <AppHeader
        title="Accounts"
        meta={usersQ.data ? `${usersQ.data.filter((u) => u.isActive).length} active` : undefined}
        actions={
          <>
            <Link to="/admin" className="btn btn--ghost btn--small" style={{ textDecoration: 'none' }}><Icon name="chevronLeft" size={18} /> Battalion</Link>
            <AccountButton onClick={() => setAccountOpen(true)} />
          </>
        }
      />
      <main className="page__content">
        {usersQ.isPending ? (
          <SkeletonRows />
        ) : usersQ.isError ? (
          <EmptyState icon="alert" title="Couldn't load accounts" action={<Button onClick={() => usersQ.refetch()}>Try again</Button>} />
        ) : (
          <>
            <section className="group" aria-labelledby="cdr-title">
              <h2 id="cdr-title" className="group__title"><span>Unit commanders</span><span className="num">{groups.commanders.length}</span></h2>
              {groups.commanders.length === 0 ? <div className="roll"><EmptyState title="No commander accounts yet" text="Each unit needs at least one commander to mark attendance." /></div> : <ul className="roll">{groups.commanders.map(renderUser)}</ul>}
            </section>
            <section className="group" aria-labelledby="adm-title">
              <h2 id="adm-title" className="group__title"><span>S1 admins</span><span className="num">{groups.admins.length}</span></h2>
              <ul className="roll">{groups.admins.map(renderUser)}</ul>
            </section>
          </>
        )}
      </main>
      <footer className="footer">
        <div className="footer__inner">
          <Button variant="primary" block onClick={() => setEditing('new')}><Icon name="plus" size={18} /> Create account</Button>
        </div>
      </footer>
      <UserSheet
        user={editing}
        units={unitsQ.data ?? []}
        selfId={me.user.id}
        busy={create.isPending || update.isPending || reset.isPending}
        onClose={() => setEditing(null)}
        onCreate={(body) => create.mutate(body, { onError })}
        onUpdate={(id, patch) => update.mutate({ id, ...patch }, { onError })}
        onReset={(id, password) => reset.mutate({ id, password }, { onError })}
      />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

interface UserSheetProps {
  user: UserDto | 'new' | null;
  units: UnitDto[];
  selfId: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (body: CreateUserBody) => void;
  onUpdate: (id: string, patch: { displayName?: string; unitId?: string | null; isActive?: boolean }) => void;
  onReset: (id: string, password: string) => void;
}

function UserSheet({ user, units, selfId, busy, onClose, onCreate, onUpdate, onReset }: UserSheetProps) {
  const isNew = user === 'new';
  const existing = user && user !== 'new' ? user : null;
  const [key, setKey] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'COMMANDER'>('COMMANDER');
  const [unitId, setUnitId] = useState<string>('S1');
  const [password, setPassword] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentKey = user === null ? null : isNew ? 'new' : existing!.id;
  if (currentKey !== key) {
    setKey(currentKey);
    setEmail(existing?.email ?? '');
    setDisplayName(existing?.displayName ?? '');
    setRole(existing?.role ?? 'COMMANDER');
    setUnitId(existing?.unitId ?? 'S1');
    setPassword('');
    setResetPw('');
    setErrors({});
  }

  const submit = () => {
    if (isNew) {
      const parsed = v.safeParse(CreateUserSchema, { email, displayName, role, unitId: role === 'COMMANDER' ? unitId : null, password });
      if (!parsed.success) return setErrors(firstIssue(parsed.issues));
      onCreate(parsed.output);
    } else if (existing) {
      if (displayName.trim().length < 2) return setErrors({ displayName: 'Enter a name' });
      onUpdate(existing.id, { displayName: displayName.trim(), unitId: existing.role === 'COMMANDER' ? unitId : undefined });
    }
  };

  const doReset = () => {
    if (!existing) return;
    const parsed = v.safeParse(PasswordSchema, resetPw);
    if (!parsed.success) return setErrors({ resetPw: parsed.issues[0]?.message ?? 'Invalid password' });
    onReset(existing.id, resetPw);
  };

  return (
    <Sheet
      open={user !== null}
      onClose={onClose}
      title={isNew ? 'Create account' : existing?.displayName ?? ''}
      subtitle={isNew ? 'They sign in with this email and must change the password on first sign-in.' : existing?.email}
      footer={
        <>
          <Button variant="primary" block busy={busy} onClick={submit}>{isNew ? 'Create account' : 'Save'}</Button>
          {existing && existing.id !== selfId && (
            <Button variant={existing.isActive ? 'danger-ghost' : 'ghost'} block disabled={busy} onClick={() => onUpdate(existing.id, { isActive: !existing.isActive })}>
              {existing.isActive ? 'Deactivate account' : 'Reactivate account'}
            </Button>
          )}
        </>
      }
    >
      {isNew && (
        <label className="field">
          <span className="field__label">Email</span>
          <input className="field__input" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors['email'] || undefined} />
          {errors['email'] && <span className="field__error" role="alert">{errors['email']}</span>}
        </label>
      )}
      <label className="field">
        <span className="field__label">Name and rank</span>
        <input className="field__input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. MAJ Lim Wei Jie" aria-invalid={!!errors['displayName'] || undefined} />
        {errors['displayName'] && <span className="field__error" role="alert">{errors['displayName']}</span>}
      </label>
      {isNew && (
        <div className="field">
          <span className="field__label">Role</span>
          <div className="subtype-grid">
            <button type="button" className="subtype-opt" aria-pressed={role === 'COMMANDER'} onClick={() => setRole('COMMANDER')}>Unit commander</button>
            <button type="button" className="subtype-opt" aria-pressed={role === 'ADMIN'} onClick={() => setRole('ADMIN')}>S1 admin</button>
          </div>
        </div>
      )}
      {(isNew ? role === 'COMMANDER' : existing?.role === 'COMMANDER') && (
        <label className="field">
          <span className="field__label">Unit</span>
          <select className="field__input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      )}
      {isNew && (
        <label className="field">
          <span className="field__label">Temporary password</span>
          <input className="field__input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors['password'] || undefined} />
          <span className="field__hint">Share it with them directly. At least 8 characters.</span>
          {errors['password'] && <span className="field__error" role="alert">{errors['password']}</span>}
        </label>
      )}
      {existing && (
        <div className="field">
          <span className="field__label">Reset password</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="field__input" type="text" autoComplete="off" placeholder="New temporary password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} aria-invalid={!!errors['resetPw'] || undefined} />
            <Button onClick={doReset} disabled={busy || !resetPw}>Reset</Button>
          </div>
          {errors['resetPw'] && <span className="field__error" role="alert">{errors['resetPw']}</span>}
          <span className="field__hint">They will be asked to choose their own password at next sign-in.</span>
        </div>
      )}
    </Sheet>
  );
}
