import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useBackend } from '../providers';

/** Creates the first S1 admin. Only reachable while the server reports needsBootstrap. */
export function BootstrapPage() {
  const { api, config } = useBackend();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!config.needsBootstrap && !done) {
    return (
      <main className="screen screen--narrow">
        <h1>Already set up</h1>
        <p className="muted">An account exists on this deployment.</p>
        <Link to="/sign-in" className="btn btn--primary">
          Go to sign in
        </Link>
      </main>
    );
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.bootstrap({ email, displayName, bootstrapPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="screen screen--narrow">
        <h1>S1 admin created</h1>
        <p>Sign in with {email} and the bootstrap password. You will be asked to choose your own password.</p>
        <p className="muted">Now remove the BOOTSTRAP_ADMIN_PASSWORD secret from the Worker.</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/sign-in')}>
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main className="screen screen--narrow">
      <div className="stack stack--tight">
        <h1>Create the first S1 admin</h1>
        <p className="muted">This works once, while no accounts exist, and needs the bootstrap password set on the Worker.</p>
      </div>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="bs-name">Name as shown to units</label>
          <input id="bs-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="CPT Ong Li Ting" required />
        </div>
        <div className="field">
          <label htmlFor="bs-email">Email</label>
          <input id="bs-email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="bs-secret">Bootstrap password</label>
          <input id="bs-secret" type="password" autoComplete="off" value={bootstrapPassword} onChange={(e) => setBootstrapPassword(e.target.value)} required />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email || !displayName || !bootstrapPassword}>
          {busy ? 'Creating…' : 'Create admin'}
        </button>
      </form>
      <Link to="/sign-in" className="muted">
        Back to sign in
      </Link>
    </main>
  );
}
