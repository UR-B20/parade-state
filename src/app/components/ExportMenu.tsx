import { useEffect, useRef, useState } from 'react';
import type { IsoDate } from '@shared/dates';
import { isMonth, monthLabel } from '@shared/export/monthly';
import { useApi } from '../api/provider';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import './Admin.css';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ExportMenu({ eventId, fileStem, date, inline }: { eventId: string; fileStem: string; /** Selected date; the month export defaults to its month. */ date: IsoDate; inline?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'xlsx' | 'csv' | 'month' | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [month, setMonth] = useState(date.slice(0, 7));
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
      saveBlob(await api.download(eventId, format), `${fileStem}.${format}`);
      toast.show(`Exported ${fileStem}.${format}`);
      setOpen(false);
    } catch {
      toast.show("Couldn't export. Check your connection and try again.", { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const downloadMonth = async () => {
    if (!isMonth(month)) return;
    setBusy('month');
    try {
      saveBlob(await api.downloadMonth(month), `parade-state-${month}.xlsx`);
      toast.show(`Exported parade-state-${month}.xlsx`);
      setMonthOpen(false);
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
          <button type="button" role="menuitem" className="export__item" onClick={() => { setOpen(false); setMonth(date.slice(0, 7)); setMonthOpen(true); }} disabled={busy !== null}>
            <Icon name="calendar" size={18} />
            <span>
              Excel, whole month…
              <small>Every parade of a month, as submitted</small>
            </span>
          </button>
        </div>
      )}
      <Sheet
        open={monthOpen}
        title="Export a month"
        subtitle="Three sheets: the battalion by day, each Branch/Coy by day, and every absentee."
        onClose={() => { if (busy !== 'month') setMonthOpen(false); }}
        footer={<Button variant="primary" block busy={busy === 'month'} disabled={!isMonth(month)} onClick={downloadMonth}>Download {isMonth(month) ? monthLabel(month) : ''} (.xlsx)</Button>}
      >
        <label className="field">
          <span className="field__label">Month</span>
          <input className="field__input num" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <p className="dialog__muted">Figures come from what each Branch/Coy submitted. Parades a Branch/Coy never submitted show as "Not submitted".</p>
      </Sheet>
    </div>
  );
}
