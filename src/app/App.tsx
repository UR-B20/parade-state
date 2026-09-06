import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createBrowserRouter, createHashRouter, Navigate, Outlet, RouterProvider, useParams } from 'react-router-dom';
import { ApiProvider } from './api/provider';
import { bootstrapApi, type Bootstrapped } from './api';
import { useMe } from './api/queries';
import { MARK_MUTATION_KEY, type MarkVariables } from './api/mutations';
import { AuthProvider } from './state/auth';
import { ConfigProvider } from './state/config';
import { DemoProvider } from './state/demo';
import { ToastProvider } from './components/Toast';
import { MarkPage } from './pages/commander/MarkPage';
import { RollPage } from './pages/commander/RollPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { SkeletonRows, SkeletonSummary } from './components/Skeleton';
import { AppHeader } from './components/AppHeader';
import { EmptyState } from './components/EmptyState';
import { Button } from './components/Button';
import { createPersister, PERSIST_BUSTER } from './lib/persist';
import './pages/pages.css';

function LoadingPage() {
  return (
    <div className="page">
      <AppHeader title={' '} />
      <div className="page__content">
        <SkeletonSummary />
        <SkeletonRows />
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const meQ = useMe();
  if (meQ.isPending) return <LoadingPage />;
  if (meQ.isError || !meQ.data) return <Navigate to="/login" replace />;
  if (meQ.data.user.mustChangePassword && !location.pathname.endsWith('/account/password') && !location.hash.endsWith('/account/password')) {
    return (
      <AuthProvider me={meQ.data}>
        <Navigate to="/account/password" replace />
      </AuthProvider>
    );
  }
  return (
    <AuthProvider me={meQ.data}>
      <DemoProvider available={meQ.data.demo.enabled}>{children}</DemoProvider>
    </AuthProvider>
  );
}

function Home() {
  const meQ = useMe();
  if (!meQ.data) return null;
  return <Navigate to={meQ.data.user.role === 'ADMIN' ? '/admin' : '/mark'} replace />;
}

function AdminUnitPage() {
  const { unitId } = useParams();
  return <MarkPage unitId={unitId} />;
}

const createRouter = import.meta.env.VITE_HASH_ROUTER === '1' ? createHashRouter : createBrowserRouter;

const router = createRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <Shell>
        <Outlet />
      </Shell>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'mark', element: <MarkPage /> },
      { path: 'roll', element: <RollPage /> },
      { path: 'account/password', element: <ChangePasswordPage /> },
      { path: 'admin', element: <DashboardPage /> },
      { path: 'admin/absentees', element: <DashboardPage /> },
      { path: 'admin/units/:unitId', element: <AdminUnitPage /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: 'admin/settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  const [boot, setBoot] = useState<Bootstrapped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    bootstrapApi()
      .then((b) => { if (!cancelled) setBoot(b); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [attempt]);

  const queryClient = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true, gcTime: 24 * 3600_000 },
        mutations: { networkMode: 'online', gcTime: 24 * 3600_000 },
      },
    });
    return qc;
  }, []);

  useEffect(() => {
    if (!boot) return;
    // Persisted (paused) mark mutations need their function restored after a reload.
    queryClient.setMutationDefaults(MARK_MUTATION_KEY, {
      mutationFn: (v: MarkVariables) => boot.api.mark(v.unitId, v.eventId, v.personId, v.body),
    });
    const unsub = onlineManager.subscribe((online) => {
      if (online) void queryClient.resumePausedMutations();
    });
    return unsub;
  }, [boot, queryClient]);

  const persister = useMemo(() => createPersister(), []);

  if (error) {
    return (
      <div className="page">
        <div className="page__content" style={{ justifyContent: 'center' }}>
          <EmptyState icon="offline" title="Couldn't reach SoldierTrack" text={error} action={<Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
        </div>
      </div>
    );
  }
  if (!boot) return <LoadingPage />;

  return (
    <ConfigProvider config={boot.config}>
      <ApiProvider client={boot.api}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, buster: PERSIST_BUSTER, maxAge: 24 * 3600_000, dehydrateOptions: { shouldDehydrateQuery: (q) => q.queryKey[0] !== 'me' && q.state.status === 'success' } }}
          onSuccess={() => { void queryClient.resumePausedMutations(); }}
        >
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </PersistQueryClientProvider>
      </ApiProvider>
    </ConfigProvider>
  );
}
