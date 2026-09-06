import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Backend } from './backend';
import { queueHandlers, type QueueNotice } from './api/queries';
import { OfflineQueue } from './offline/queue';

const BackendContext = createContext<Backend | null>(null);
const QueueContext = createContext<OfflineQueue | null>(null);
const NoticeContext = createContext<{ notices: QueueNotice[]; dismiss: (op: QueueNotice) => void } | null>(null);

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error('useBackend outside AppProviders');
  return b;
}

export function useQueue(): OfflineQueue {
  const q = useContext(QueueContext);
  if (!q) throw new Error('useQueue outside AppProviders');
  return q;
}

export function useQueueNotices() {
  const n = useContext(NoticeContext);
  if (!n) throw new Error('useQueueNotices outside AppProviders');
  return n;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'parade-state:queries',
  throttleTime: 500,
});

export function AppProviders({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [notices, setNotices] = useState<QueueNotice[]>([]);
  const { queryClient, queue } = useMemo(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: WEEK,
          networkMode: 'offlineFirst',
          retry: (count, err) => count < 1 && !(err instanceof Error && err.name === 'ApiError'),
          refetchOnWindowFocus: true,
        },
        mutations: { networkMode: 'offlineFirst', retry: 0 },
      },
    });
    const queue = new OfflineQueue(
      backend.api,
      queueHandlers(queryClient, (notice) => setNotices((n) => [...n, notice])),
    );
    return { queryClient, queue };
  }, [backend]);

  const noticeValue = useMemo(
    () => ({ notices, dismiss: (op: QueueNotice) => setNotices((n) => n.filter((x) => x !== op)) }),
    [notices],
  );

  return (
    <BackendContext.Provider value={backend}>
      <QueueContext.Provider value={queue}>
        <NoticeContext.Provider value={noticeValue}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}
            onSuccess={() => void queue.replay()}
          >
            {children}
          </PersistQueryClientProvider>
        </NoticeContext.Provider>
      </QueueContext.Provider>
    </BackendContext.Provider>
  );
}
