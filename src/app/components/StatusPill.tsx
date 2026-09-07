import type { ReactNode } from 'react';
import { statusLabel, UNMARKED_LABEL, type EffectiveKind, type HalfDay } from '@shared/statuses';
import './StatusPill.css';

type Tone = 'ok' | 'warn' | 'danger' | 'pending' | 'neutral';

interface StatusPillProps {
  status?: EffectiveKind;
  /** Shown as 'LL (PM)' for a half-day absence. */
  halfDay?: HalfDay | null;
  tone?: Tone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatusPill({ status, halfDay, tone, dot, children, className }: StatusPillProps) {
  const cls = ['pill', status && `pill--${status}`, tone && `pill--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className="pill__dot" aria-hidden="true" />}
      {children ?? (status ? (status === 'UNMARKED' ? UNMARKED_LABEL : statusLabel(status, halfDay)) : null)}
    </span>
  );
}
