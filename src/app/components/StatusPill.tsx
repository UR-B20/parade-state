import type { ReactNode } from 'react';
import { STATUS_LABEL, type Status } from '@shared/statuses';
import './StatusPill.css';

type Tone = 'ok' | 'warn' | 'danger' | 'pending' | 'neutral';

interface StatusPillProps {
  status?: Status;
  /** Default (unconfirmed) Present renders outlined and muted. */
  isDefault?: boolean;
  tone?: Tone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusPill({ status, isDefault, tone, dot, children, className }: StatusPillProps) {
  const cls = ['pill', status && `pill--${status}`, isDefault && 'pill--default', tone && `pill--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className="pill__dot" aria-hidden="true" />}
      {children ?? (status ? STATUS_LABEL[status] : null)}
    </span>
  );
}
