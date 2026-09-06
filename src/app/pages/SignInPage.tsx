import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useBackend } from '../providers';

export function SignInPage() {
  const { session, config, demo } = useBackend();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await session.signIn(e, p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    void signIn(email, password);
  }

  return (
    <main className="screen screen--narrow">
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">
          PS
        </div>
        <h1>Parade State</h1>
        <p className="muted">Sign in to mark your unit.</p>
      </div>

      <form className="stack" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {config.needsBootstrap && (
        <p className="muted">
          No accounts yet? <Link to="/bootstrap">Create the first S1 admin</Link>.
        </p>
      )}

      {demo && session.demoAccounts && (
        <section className="stack stack--tight">
          <h2>Demo accounts</h2>
          <p className="muted">One tap signs in. Every demo account uses the same password.</p>
          <div className="demo-accounts">
            {session.demoAccounts.map((a) => (
              <button key={a.email} type="button" className="btn btn--ghost" disabled={busy} onClick={() => void signIn(a.email, a.password)} data-testid={`demo-account-${a.email}`}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
