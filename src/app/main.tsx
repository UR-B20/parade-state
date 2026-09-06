import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { AuthStateProvider } from './auth/state';
import { createBackend } from './backend';
import { AppProviders } from './providers';
import { router } from './router';

const root = createRoot(document.getElementById('root')!);

async function start() {
  try {
    const backend = await createBackend();
    const signedIn = await backend.session.isSignedIn();
    root.render(
      <StrictMode>
        <AppProviders backend={backend}>
          <AuthStateProvider session={backend.session} initial={signedIn}>
            <RouterProvider router={router} />
          </AuthStateProvider>
        </AppProviders>
      </StrictMode>,
    );
  } catch (err) {
    console.error('Parade State could not start', err);
    root.render(
      <main className="screen screen--narrow">
        <h1>Parade State</h1>
        <p>The app could not start. Check your connection and reload.</p>
        <p className="muted mono">{err instanceof Error ? err.message : String(err)}</p>
      </main>,
    );
  }
}

void start();

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered', err));
  });
}
