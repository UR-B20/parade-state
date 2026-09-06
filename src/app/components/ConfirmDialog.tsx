import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import './Dialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', busy, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog dialog--confirm" aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} onClose={onCancel}>
      <div className="dialog__header">
        <h2 id="confirm-title" className="dialog__title">{title}</h2>
      </div>
      <div className="dialog__body">{children}</div>
      <div className="dialog__footer">
        <Button variant={danger ? 'danger-ghost' : 'primary'} block busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" block disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </dialog>
  );
}
