import { useEffect, useRef, useState } from 'react';
import { useApi } from '../api/provider';
import { Button } from './Button';
import { Icon } from './Icon';
import { useToast } from './Toast';
import './Admin.css';

export function ExportMenu({ eventId, fileStem, inline }: { eventId: string; fileStem: string; inline?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const download = async (format: 'xlsx' | 'csv') => {
    setBusy(format);
    try {
      const blob = await api.download(eventId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileStem}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.show(`Exported ${fileStem}.${format}`);
      setOpen(false);
    } catch {
      toast.show("Couldn't export. Check your connection and try again.", { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={wrap} className={inline ? '' : 'export'} style={{ position: 'relative' }}>
      <Button variant="secondary" className={inline ? '' : 'export__btn'} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="download" size={18} />
        Export
        <Icon name={open ? 'chevronDown' : 'chevronUp'} size={16} />
      </Button>
      {open && (
        <div className="export__menu" role="menu" aria-label="Export format">
          <button type="button" role="menuitem" className="export__item" onClick={() => download('xlsx')} disabled={busy !== null}>
            <Icon name="table" size={18} />
            <span>
              Excel (.xlsx)
              <small>Summary and absentees sheets</small>
            </span>
            {busy === 'xlsx' && <span className="btn__spinner" style={{ marginLeft: 'auto' }} />}
          </button>
          <button type="button" role="menuitem" className="export__item" onClick={() => download('csv')} disabled={busy !== null}>
            <Icon name="download" size={18} />
            <span>
              CSV (.csv)
              <small>Absentees list</small>
            </span>
            {busy === 'csv' && <span className="btn__spinner" style={{ marginLeft: 'auto' }} />}
          </button>
        </div>
      )}
    </div>
  );
}
