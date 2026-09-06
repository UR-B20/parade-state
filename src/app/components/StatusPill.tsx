import type { ReactNode } from 'react';
import { STATUS_LABEL, UNMARKED_LABEL, type EffectiveKind } from '@shared/statuses';
import './StatusPill.css';

type Tone = 'ok' | 'warn' | 'danger' | 'pending' | 'neutral';

interface StatusPillProps {
  status?: EffectiveKind;
  tone?: Tone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusPill({ status, tone, dot, children, className }: StatusPillProps) {
  const cls = ['pill', status && `pill--${status}`, tone && `pill--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className="pill__dot" aria-hidden="true" />}
      {children ?? (status ? (status === 'UNMARKED' ? UNMARKED_LABEL : STATUS_LABEL[status]) : null)}
    </span>
  );
}
