import { Link } from 'react-router-dom';
import './Admin.css';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  to: string;
}

export function Tabs({ items, activeId, label }: { items: TabItem[]; activeId: string; label: string }) {
  return (
    <nav className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <Link key={t.id} to={t.to} role="tab" className="tab" aria-selected={t.id === activeId} replace>
          {t.label}
          {t.count !== undefined && <span className="tab__count num">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
