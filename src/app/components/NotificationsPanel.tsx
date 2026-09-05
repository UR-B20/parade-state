import { useNavigate } from 'react-router-dom';
import { formatSgTime, sgDateOf, formatSgDateShort } from '@shared/dates';
import type { NotificationDto, NotificationsDto } from '@shared/types';
import { useMarkNotificationsRead } from '../api/mutations';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import './Admin.css';

export function NotificationsButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <Button variant="ghost" small onClick={onClick} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
      <Icon name="bell" size={18} />
      Notifications
      {unread > 0 && <span className="badge num" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </Button>
  );
}

function when(n: NotificationDto, today: string): string {
  const d = sgDateOf(n.createdAt);
  return d === today ? formatSgTime(n.createdAt) : `${formatSgDateShort(d, today)} ${formatSgTime(n.createdAt)}`;
}

export function NotificationsPanel({ open, onClose, data, today }: { open: boolean; onClose: () => void; data: NotificationsDto | undefined; today: string }) {
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const openItem = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate([n.id]);
    onClose();
    navigate(`/admin?date=${sgDateOf(n.createdAt) === today ? today : n.eventId.slice(0, 10)}&event=${n.eventId}`);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : 'All read'}
      headerAction={
        <div style={{ display: 'flex', gap: 4 }}>
          {unread > 0 && (
            <Button variant="ghost" small onClick={() => markRead.mutate('all')} busy={markRead.isPending}>
              Mark all read
            </Button>
          )}
          <Button variant="ghost" small onClick={onClose} aria-label="Close">Close</Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon="bell" title="No notifications yet" text="Submissions, resubmissions and late units appear here." />
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" className={`notif notif--${n.type}${n.readAt ? ' notif--read' : ''}`} onClick={() => openItem(n)}>
                <span className="notif__dot" aria-hidden="true" />
                <span className="notif__body">
                  <span className="notif__msg">{n.message}</span>
                  <span className="notif__time num">{when(n, today)}{n.readAt ? '' : ' · Unread'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
