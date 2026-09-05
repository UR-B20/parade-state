import { useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { ApiProvider } from './api/provider';
import { createApiClient } from './api';
import { useMe } from './api/queries';
import { AuthProvider } from './state/auth';
import { DemoProvider } from './state/demo';
import { ToastProvider } from './components/Toast';
import { MarkPage } from './pages/commander/MarkPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { useParams } from 'react-router-dom';
import { SkeletonRows, SkeletonSummary } from './components/Skeleton';
import { AppHeader } from './components/AppHeader';
import './pages/pages.css';

function Shell({ children }: { children: ReactNode }) {
  const meQ = useMe();
  if (meQ.isPending) {
    return (
      <div className="page">
        <AppHeader title={' '} />
        <div className="page__content">
          <SkeletonSummary />
          <SkeletonRows />
        </div>
      </div>
    );
  }
  if (meQ.isError || !meQ.data) {
    return <Navigate to="/login" replace />;
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

function Placeholder({ title }: { title: string }) {
  return (
    <div className="page">
      <AppHeader title={title} />
      <div className="page__content">This screen is built in a later milestone.</div>
    </div>
  );
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
      { path: 'roll', element: <Placeholder title="Manage roll" /> },
      { path: 'account/password', element: <Placeholder title="Change password" /> },
      { path: 'admin', element: <DashboardPage /> },
      { path: 'admin/absentees', element: <DashboardPage /> },
      { path: 'admin/units/:unitId', element: <AdminUnitPage /> },
      { path: 'admin/users', element: <Placeholder title="Accounts" /> },
      { path: 'admin/settings', element: <Placeholder title="Cut-offs and date unlocks" /> },
    ],
  },
]);

export function App() {
  const api = useMemo(() => createApiClient(), []);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
          mutations: { networkMode: 'online' },
        },
      }),
    [],
  );
  return (
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
}
