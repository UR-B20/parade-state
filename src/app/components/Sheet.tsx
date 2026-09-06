import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import './Dialog.css';

interface SheetProps {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
}

/** Generic bottom sheet (centred card on wide screens) built on the native dialog. */
export function Sheet({ open, title, subtitle, onClose, children, footer, headerAction }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = `sheet-${title.replace(/\W+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="dialog__handle" aria-hidden="true" />
      <div className="dialog__header">
        <div>
          <h2 id={id} className="dialog__title">{title}</h2>
          {subtitle && <div className="dialog__subtitle">{subtitle}</div>}
        </div>
        {headerAction ?? (
          <Button variant="ghost" small onClick={onClose} aria-label="Close">
            Close
          </Button>
        )}
      </div>
      {open && <div className="dialog__body">{children}</div>}
      {footer && <div className="dialog__footer">{footer}</div>}
    </dialog>
  );
}
