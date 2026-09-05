import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ok' | 'danger-ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  small?: boolean;
  icon?: boolean;
  busy?: boolean;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', block, small, icon, busy, className, children, disabled, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, block && 'btn--block', small && 'btn--small', icon && 'btn--icon', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
