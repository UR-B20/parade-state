import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as v from 'valibot';
import { BootstrapSchema, firstIssue } from '@shared/schemas';
import type { MeDto } from '@shared/types';
import { ApiError } from '../api/client';
import { keys } from '../api/keys';
import { useSignIn } from '../api/mutations';
import { useApi } from '../api/provider';
import { useDemoAccounts, useMe } from '../api/queries';
import { useConfig } from '../state/config';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import badge from '../brand/soldiertrack-badge.svg';
import wordmark from '../brand/soldiertrack-wordmark.svg';
import sleeve from '../brand/sleeve.jpg';
import '../components/Dialog.css';
import './LoginPage.css';

export function LoginPage() {
  const config = useConfig();
  if (config.needsBootstrap) return <BootstrapPage />;
  return <SignInPage />;
}

/** Full-bleed camo photo, the badge over the wordmark on a dark band, and the card beside it. */
function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="login-scene">
      <img className="login-scene__bg" src={sleeve} alt="" draggable={false} />
      <div className="login-scene__band">
        <div className="login-scene__lockup" role="img" aria-label="SoldierTrack, Personnel Tracking System. Because every soldier counts.">
          <img className="login-scene__badge" src={badge} alt="" draggable={false} />
          <img className="login-scene__wordmark" src={wordmark} alt="" draggable={false} />
        </div>
        <div className="login-scene__side">{children}</div>
      </div>
    </div>
  );
}

/** First run: create the S1 Branch admin with the setup key from the deployment secrets. */
function BootstrapPage() {
  const api = useApi();
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: '', displayName: '', password: '', setupKey: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = v.safeParse(BootstrapSchema, form);
    if (!parsed.success) return setErrors(firstIssue(parsed.issues));
    setErrors({});
    setError(null);
    setBusy(true);
    try {
      await api.bootstrap(parsed.output);
      await qc.invalidateQueries();
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete setup.');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text', hint?: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" type={type} value={form[key]} autoComplete="off" autoCapitalize="none" aria-invalid={!!errors[key] || undefined} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      {errors[key] ? <span className="field__error" role="alert">{errors[key]}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );

  return (
    <Scene>
      <div className="login-card">
        <h1 className="login-card__title">Set up SoldierTrack</h1>
        <p className="login-card__sub">Create the first S1 Branch admin account. You can add commanders afterwards.</p>
        <form className="login-card__form" onSubmit={submit} noValidate>
          {field('displayName', 'Your name and rank')}
          {field('username', 'Username', 'text', 'Letters, digits, dots, dashes and underscores.')}
          {field('password', 'Password', 'password', 'At least 8 characters.')}
          {field('setupKey', 'Setup key', 'password', 'The BOOTSTRAP_ADMIN_PASSWORD secret set on the deployment.')}
          {error && <div className="login-card__error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
          <Button type="submit" variant="primary" block busy={busy}>Create admin account</Button>
        </form>
      </div>
    </Scene>
  );
}

function SignInPage() {
  const meQ = useMe();
  const demoQ = useDemoAccounts();
  const signIn = useSignIn();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<{ login?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);

  if (meQ.data) return <Navigate to={meQ.data.user.mustChangePassword ? '/account/password' : '/'} replace />;

  /** Sign in, then load the account before leaving the page so the next screen never renders blind. */
  const finish = async (loginValue: string, pw: string) => {
    await signIn.mutateAsync({ login: loginValue, password: pw });
    const me = await qc.fetchQuery<MeDto>({ queryKey: keys.me, staleTime: 0 });
    navigate(me.user.mustChangePassword ? '/account/password' : '/', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof fieldError = {};
    if (!login.trim()) errs.login = 'Enter your username';
    if (!password) errs.password = 'Enter your password';
    setFieldError(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    try {
      await finish(login.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your connection and try again.');
    }
  };

  const demo = async (demoEmail: string) => {
    setError(null);
    try {
      await finish(demoEmail, 'demo1234');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    }
  };

  return (
    <Scene>
      <div className="login-card">
        <h1 className="login-card__title login-card__title--caps">Login</h1>
        <p className="login-card__sub">Please log in to access this page.</p>
        <form className="login-card__form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="field__input"
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={login}
              aria-invalid={!!fieldError.login || undefined}
              onChange={(e) => { setLogin(e.target.value); setFieldError((f) => ({ ...f, login: undefined })); }}
            />
            {fieldError.login && <span className="field__error" role="alert">{fieldError.login}</span>}
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={!!fieldError.password || undefined}
              onChange={(e) => { setPassword(e.target.value); setFieldError((f) => ({ ...f, password: undefined })); }}
            />
            {fieldError.password && <span className="field__error" role="alert">{fieldError.password}</span>}
          </label>
          {error && (
            <div className="login-card__error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" variant="primary" block busy={signIn.isPending}>
            Login
          </Button>
          <p className="login-card__note">Forgot your password? Contact S1 Branch to reset it.</p>
        </form>
        {demoQ.data && demoQ.data.length > 0 && (
          <div className="login-card__demo">
            <p className="login-card__demo-title">Demo accounts</p>
            {demoQ.data.map((a) => (
              <Button key={a.email} variant="secondary" block onClick={() => demo(a.email)} disabled={signIn.isPending}>
                Sign in as {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Scene>
  );
}
