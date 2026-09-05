import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Feedback.css';

export function EmptyState({ icon = 'users', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={22} /></span>
      <p className="empty__title">{title}</p>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  );
}
