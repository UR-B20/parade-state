import { useState } from 'react';
import { addDays, formatSgDateMedium } from '@shared/dates';
import { ABSENCE_STATUSES, isMultiDay, OTHERS_SUB_TYPES, STATUS_LABEL, STATUS_LONG_LABEL, SUB_TYPE_LABEL, type AbsenceStatus, type OthersSubType } from '@shared/statuses';
import type { EffectiveStatus, MarkBody } from '@shared/types';
import { Sheet } from './ui';

interface Props {
  person: EffectiveStatus;
  eventDate: string;
  today: string;
  onClose: () => void;
  onSave: (body: MarkBody) => void;
}

export function MarkSheet({ person, eventDate, onClose, onSave }: Props) {
  const wasAbsent = person.status !== 'PRESENT';
  const [status, setStatus] = useState<AbsenceStatus | 'PRESENT'>(person.status);
  const [subType, setSubType] = useState<OthersSubType | null>(person.subType);
  const [startDate, setStartDate] = useState(person.startDate ?? eventDate);
  const [endDate, setEndDate] = useState<string>(person.endDate ?? (person.status === 'MC' ? addDays(eventDate, 1) : eventDate));
  const [openEnded, setOpenEnded] = useState(wasAbsent && person.endDate === null);
  const [remark, setRemark] = useState(person.remark ?? '');
  const [error, setError] = useState<string | null>(null);

  const absence = status !== 'PRESENT' ? status : null;
  const multiDay = absence ? isMultiDay(absence) : false;

  function save() {
    if (status === 'PRESENT') {
      onSave({ action: wasAbsent ? 'BACK_TO_PRESENT' : 'PRESENT' });
      return;
    }
    if (status === 'OTHERS' && !subType) {
      setError('Choose what kind of Others');
      return;
    }
    const start = multiDay ? startDate : eventDate;
    const end = multiDay ? (openEnded ? null : endDate) : eventDate;
    if (start > eventDate || (end !== null && end < eventDate)) {
      setError(`Dates must include ${formatSgDateMedium(eventDate)}`);
      return;
    }
    if (end !== null && end < start) {
      setError('End date is before the start date');
      return;
    }
    onSave({ action: 'SET', status, subType: status === 'OTHERS' ? subType : null, startDate: start, endDate: end, remark: remark.trim() || null });
  }

  return (
    <Sheet title={`${person.rank} ${person.name}`} onClose={onClose}>
      <div className="stack">
        <div className="status-picker" role="group" aria-label="Status">
          <button type="button" className="status-picker__btn st-PRESENT" aria-pressed={status === 'PRESENT'} onClick={() => setStatus('PRESENT')}>
            Present
          </button>
          {ABSENCE_STATUSES.map((s) => (
            <button key={s} type="button" className={`status-picker__btn st-${s}`} aria-pressed={status === s} onClick={() => setStatus(s)} title={STATUS_LONG_LABEL[s]}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {absence && <p className="muted" style={{ fontSize: 'var(--text-s)' }}>{STATUS_LONG_LABEL[absence]}{absence === 'RSI' ? ` · ${formatSgDateMedium(eventDate)} only` : ''}</p>}

        {status === 'OTHERS' && (
          <div className="field">
            <label>Kind</label>
            <div className="segmented" role="group" aria-label="Kind of Others">
              {OTHERS_SUB_TYPES.map((t) => (
                <button key={t} type="button" className="segmented__btn" aria-pressed={subType === t} onClick={() => setSubType(t)}>
                  {SUB_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {absence && multiDay && (
          <>
            <div className="date-grid">
              <div className="field">
                <label htmlFor="mark-start">From</label>
                <input id="mark-start" type="date" value={startDate} max={eventDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mark-end">To</label>
                <input id="mark-end" type="date" value={endDate} min={eventDate} disabled={openEnded} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
              No end date yet
            </label>
          </>
        )}

        {absence && (
          <div className="field">
            <label htmlFor="mark-remark">Remark</label>
            <textarea id="mark-remark" value={remark} maxLength={200} onChange={(e) => setRemark(e.target.value)} placeholder={absence === 'MC' ? 'e.g. Fever, Bedok Polyclinic' : 'Optional'} />
          </div>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}

        <button type="button" className="btn btn--primary btn--block" onClick={save} data-testid="mark-save">
          {status === 'PRESENT' ? (wasAbsent ? 'Back to Present' : 'Confirm present') : `Save ${STATUS_LABEL[status]}`}
        </button>
      </div>
    </Sheet>
  );
}
