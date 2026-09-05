import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { Button } from './Button';
import { Icon } from './Icon';
import { useConnection } from '../state/connection';
import { useDemo } from '../state/demo';
import './Feedback.css';

export function ConnectionBanner() {
  const { online, pendingCount } = useConnection();
  const { simulatedOffline, setSimulatedOffline } = useDemo();
  const qc = useQueryClient();
  if (online) return null;

  const retry = () => {
    if (simulatedOffline) setSimulatedOffline(false);
    onlineManager.setOnline(navigator.onLine);
    void qc.resumePausedMutations();
  };

  return (
    <div className="banner" role="status" aria-live="polite">
      <Icon name="offline" />
      <span className="banner__text">
        Connection lost
        <small>
          {pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} will be saved when you're back online.` : 'You can keep marking. Changes save when the connection returns.'}
        </small>
      </span>
      <Button small variant="secondary" onClick={retry}>Retry</Button>
    </div>
  );
}

export function LockedDateNotice({ date }: { date: string }) {
  return (
    <div className="banner banner--info" role="status">
      <Icon name="lock" />
      <span className="banner__text">
        Past date locked
        <small>Attendance for {date} is read-only. Ask S1 to unlock it if a correction is needed.</small>
      </span>
    </div>
  );
}
