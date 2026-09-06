import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { keys, useMe } from '../api/queries';
import { ApiError } from '../api/client';
import { TopBar } from '../components/ui';
import { useBackend } from '../providers';

export function ChangePasswordPage() {
  const { api, session } = useBackend();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forced = me.data?.user.mustChangePassword ?? false;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.changePassword({ newPassword: password });
      qc.setQueryData(keys.me, (data: typeof me.data) => (data ? { ...data, user: result.user } : data));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title={forced ? 'Set a new password' : 'Change password'}
        back={forced ? undefined : '/'}
        right={
          forced ? (
            <button type="button" className="btn btn--text" onClick={() => void session.signOut()}>
              Sign out
            </button>
          ) : undefined
        }
      />
      <main className="screen screen--narrow" style={{ justifyContent: 'flex-start' }}>
        {forced && <p className="muted">You signed in with a temporary password. Choose your own before continuing.</p>}
        <form className="stack" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <span className="muted" style={{ fontSize: 'var(--text-s)' }}>
              At least 8 characters.
            </span>
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Repeat it</label>
            <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy || password.length < 8 || !confirm}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </main>
    </>
  );
}
