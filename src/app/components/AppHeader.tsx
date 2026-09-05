import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import './AppHeader.css';

interface AppHeaderProps {
  title: string;
  /** Right-hand side of the title row, usually the date. */
  meta?: ReactNode;
  /** Labelled actions on the brand row. */
  actions?: ReactNode;
  /** Row below the title, usually the event picker. */
  children?: ReactNode;
  wide?: boolean;
}

export function AppHeader({ title, meta, actions, children, wide }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className={`app-header__inner${wide ? ' app-header__inner--wide' : ''}`}>
        <div className="app-header__brand-row">
          <span className="app-header__brand">
            <BrandMark />
            Parade State
          </span>
          {actions && <div className="app-header__actions">{actions}</div>}
        </div>
        <div className="app-header__title-row">
          <h1 className="app-header__title">{title}</h1>
          {meta && <span className="app-header__date num">{meta}</span>}
        </div>
        {children}
      </div>
    </header>
  );
}
