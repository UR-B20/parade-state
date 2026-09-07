import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { keys } from '../api/keys';
import { useApi } from '../api/provider';
import { useAuth } from '../state/auth';
import { AppHeader } from '../components/AppHeader';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import '../components/Dialog.css';
import './pages.css';

export function ChangePasswordPage() {
  const api = useApi();
  const me = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters');
    if (password !== confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(password);
      await qc.invalidateQueries({ queryKey: keys.me });
      toast.show('Password changed');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--column">
      <AppHeader title="Change password" meta={me.user.username} />
      <main className="page__content">
        {me.user.mustChangePassword && (
          <p className="dialog__text" style={{ padding: '4px 0' }}>Your password was set by S1 Branch. Choose a new one before you continue.</p>
        )}
        <form className="roll" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={submit} noValidate>
          <label className="field">
            <span className="field__label">New password</span>
            <input className="field__input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error || undefined} />
            <span className="field__hint">At least 8 characters.</span>
          </label>
          <label className="field">
            <span className="field__label">Confirm new password</span>
            <input className="field__input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <span className="field__error" role="alert">{error}</span>}
          <Button type="submit" variant="primary" block busy={busy}>Save new password</Button>
          {!me.user.mustChangePassword && <Button variant="ghost" block onClick={() => navigate(-1)}>Cancel</Button>}
        </form>
      </main>
    </div>
  );
}
