import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe } from './api/queries';
import { ApiError } from './api/client';
import { useSignedIn } from './auth/state';
import { Spinner } from './components/ui';
import { Shell } from './components/Shell';
import { useBackend } from './providers';
import { BootstrapPage } from './pages/BootstrapPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { ReviewPage } from './pages/ReviewPage';
import { RollPage } from './pages/RollPage';
import { S1HomePage } from './pages/S1HomePage';
import { SignInPage } from './pages/SignInPage';
import { UnitHomePage } from './pages/UnitHomePage';

/** Signed-in area: loads the profile once and enforces the password-change gate. */
function Protected() {
  const signedIn = useSignedIn();
  const location = useLocation();
  const { session } = useBackend();
  const me = useMe(signedIn);

  if (!signedIn) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (me.isPending && !me.data) return <Spinner />;
  if (me.error && !me.data) {
    if (me.error instanceof ApiError && (me.error.status === 401 || me.error.status === 403)) {
      void session.signOut();
      return <Navigate to="/sign-in" replace />;
    }
    return (
      <main className="screen screen--narrow">
        <h1>Parade State</h1>
        <p>Could not load your account. Check your connection and try again.</p>
        <button type="button" className="btn btn--primary" onClick={() => me.refetch()}>
          Try again
        </button>
      </main>
    );
  }
  if (me.data?.user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

function Public() {
  const signedIn = useSignedIn();
  if (signedIn) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      {
        element: <Public />,
        children: [
          { path: '/sign-in', element: <SignInPage /> },
          { path: '/bootstrap', element: <BootstrapPage /> },
        ],
      },
      {
        element: <Protected />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/change-password', element: <ChangePasswordPage /> },
          { path: '/s1', element: <S1HomePage /> },
          { path: '/units/:unitId', element: <UnitHomePage /> },
          { path: '/units/:unitId/events/:eventId', element: <RollPage /> },
          { path: '/units/:unitId/events/:eventId/review', element: <ReviewPage /> },
          { path: '/units/:unitId/events/:eventId/history', element: <HistoryPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
