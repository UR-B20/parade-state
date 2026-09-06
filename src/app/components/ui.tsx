import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, type Status } from '@shared/statuses';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Banner({ tone = 'plain', title, children, action }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'plain'; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner${tone === 'plain' ? '' : ` banner--${tone}`}`} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="banner__body">
        {title && <span className="banner__title">{title}</span>}
        {children && <span>{children}</span>}
      </div>
      {action}
    </div>
  );
}

export function StatusChip({ status, label, muted }: { status: Status; label?: string; muted?: boolean }) {
  return <span className={`chip st-${status}${muted ? ' chip--muted' : ''}`}>{label ?? STATUS_LABEL[status]}</span>;
}

export function TopBar({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {back && (
        <Link to={back} className="icon-btn" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      )}
      <div className="topbar__title">
        <h1>{title}</h1>
        {subtitle && <span className="topbar__sub">{subtitle}</span>}
      </div>
      {right}
    </header>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <div className="row row--between">
          <h2>{title}</h2>
          <button type="button" className="btn btn--text" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
