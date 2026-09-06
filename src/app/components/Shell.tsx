import { useCallback, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { useMe, usePendingCount } from '../api/queries';
import { useSignedIn } from '../auth/state';
import { formatWhen } from '../format';
import { useBackend, useQueueNotices } from '../providers';
import { Banner } from './ui';

function DemoBar() {
  const { demo } = useBackend();
  const signedIn = useSignedIn();
  const me = useMe(signedIn);
  const subscribe = useCallback((cb: () => void) => demo?.subscribe(cb) ?? (() => {}), [demo]);
  const offline = useSyncExternalStore(subscribe, () => demo?.isOffline() ?? false);
  if (!demo) return null;
  const clock = me.data?.demo.now ? `Demo clock ${formatWhen(me.data.demo.now, me.data.sgToday)}` : 'Demo';
  return (
    <div className="demo-bar" data-testid="demo-bar">
      <span>{clock}</span>
      <span className="spacer" />
      <button type="button" className="btn" aria-pressed={offline} onClick={() => demo.setOffline(!offline)} data-testid="demo-offline">
        {offline ? 'Offline (simulated)' : 'Go offline'}
      </button>
      <button type="button" className="btn" onClick={() => void demo.reset()}>
        Reset data
      </button>
    </div>
  );
}

function QueueNotices() {
  const { notices, dismiss } = useQueueNotices();
  if (notices.length === 0) return null;
  return (
    <div className="stack stack--tight" style={{ padding: '8px 16px 0' }}>
      {notices.map((n) => (
        <Banner
          key={n.op.id}
          tone="danger"
          title={n.op.kind === 'submit' ? 'Submission not accepted' : 'Change not accepted'}
          action={
            <button type="button" className="btn btn--text" onClick={() => dismiss(n)}>
              Dismiss
            </button>
          }
        >
          {n.error.message}
        </Banner>
      ))}
    </div>
  );
}

function PendingSync() {
  const pending = usePendingCount();
  if (pending === 0) return null;
  return (
    <div style={{ padding: '8px 16px 0' }}>
      <Banner tone="info" title={`${pending} change${pending === 1 ? '' : 's'} waiting for connection`}>
        Saved on this phone. They will be sent in order when the network is back.
      </Banner>
    </div>
  );
}

export function Shell() {
  return (
    <div className="shell">
      <DemoBar />
      <QueueNotices />
      <PendingSync />
      <Outlet />
    </div>
  );
}
