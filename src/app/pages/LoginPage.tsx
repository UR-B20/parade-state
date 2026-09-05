import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSignIn } from '../api/mutations';
import { useDemoAccounts, useMe } from '../api/queries';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import '../components/Dialog.css';
import './LoginPage.css';

export function LoginPage() {
  const meQ = useMe();
  const demoQ = useDemoAccounts();
  const signIn = useSignIn();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);

  if (meQ.data) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof fieldError = {};
    if (!email.trim()) errs.email = 'Enter your email';
    if (!password) errs.password = 'Enter your password';
    setFieldError(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    try {
      await signIn.mutateAsync({ email: email.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your connection and try again.');
    }
  };

  const demo = async (demoEmail: string) => {
    setError(null);
    try {
      await signIn.mutateAsync({ email: demoEmail, password: 'demo1234' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <BrandMark size={32} />
          <div>
            <h1 className="login__title">Parade State</h1>
            <p className="login__sub">Battalion attendance reporting</p>
          </div>
        </div>
        <form className="login__form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="field__input"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              aria-invalid={!!fieldError.email || undefined}
              onChange={(e) => { setEmail(e.target.value); setFieldError((f) => ({ ...f, email: undefined })); }}
            />
            {fieldError.email && <span className="field__error" role="alert">{fieldError.email}</span>}
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
            <div className="login__error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" variant="primary" block busy={signIn.isPending}>
            Sign in
          </Button>
          <p className="dialog__muted" style={{ textAlign: 'center' }}>Forgot your password? Ask S1 to reset it.</p>
        </form>
      </div>

      {demoQ.data && demoQ.data.length > 0 && (
        <div className="login__demo">
          <p className="login__demo-title">Demo accounts</p>
          {demoQ.data.map((a) => (
            <Button key={a.email} variant="secondary" block onClick={() => demo(a.email)} disabled={signIn.isPending}>
              Sign in as {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
