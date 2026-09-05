import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatSgDateLong, formatSgDateShort, type IsoDate } from '@shared/dates';
import { ABSENCE_STATUSES, isMultiDay, OTHERS_SUB_TYPES, STATUS_LABEL, STATUS_LONG_LABEL, SUB_TYPE_LABEL, type OthersSubType, type Status } from '@shared/statuses';
import type { EffectiveStatus, MarkBody } from '@shared/types';
import { Button } from './Button';
import { Icon } from './Icon';
import { StatusPill } from './StatusPill';
import { describeStatus } from './PersonRow';
import './Dialog.css';
import './StatusSheet.css';

interface StatusSheetProps {
  person: EffectiveStatus | null;
  eventDate: IsoDate;
  eventLabel: string;
  busy?: boolean;
  onSave: (body: MarkBody) => void;
  onClose: () => void;
}

interface Draft {
  status: Status;
  subType: OthersSubType | null;
  startDate: IsoDate;
  endDate: IsoDate;
  openEnded: boolean;
  remark: string;
}

function draftFor(person: EffectiveStatus, eventDate: IsoDate): Draft {
  const absent = person.status !== 'PRESENT';
  return {
    status: person.status,
    subType: person.subType,
    startDate: absent && person.startDate ? person.startDate : eventDate,
    endDate: absent && person.endDate ? person.endDate : eventDate,
    openEnded: absent && person.startDate !== null && person.endDate === null,
    remark: person.remark ?? '',
  };
}

export function StatusSheet({ person, eventDate, eventLabel, busy, onSave, onClose }: StatusSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (person) {
      setDraft(draftFor(person, eventDate));
      setError(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [person, eventDate]);

  const hasOngoingAbsence = !!person && person.status !== 'PRESENT' && person.spanId !== null;
  const ongoingRunsPast = hasOngoingAbsence && (person!.endDate === null || person!.endDate > eventDate);

  const validation = useMemo(() => {
    if (!draft) return null;
    if (draft.status === 'PRESENT') return null;
    if (draft.status === 'OTHERS' && !draft.subType) return { field: 'subType', message: 'Choose a type for Others' };
    if (isMultiDay(draft.status)) {
      if (draft.startDate > eventDate) return { field: 'startDate', message: 'Start date cannot be after the parade date' };
      if (!draft.openEnded && draft.endDate < draft.startDate) return { field: 'endDate', message: 'End date must be on or after the start date' };
      if (!draft.openEnded && draft.endDate < eventDate) return { field: 'endDate', message: 'End date cannot be before the parade date' };
    }
    return null;
  }, [draft, eventDate]);

  if (!person) {
    return <dialog ref={ref} className="dialog" onClose={onClose} />;
  }

  const update = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const pickStatus = (status: Status) => {
    if (!draft) return;
    const patch: Partial<Draft> = { status };
    if (status === 'RSI') {
      patch.startDate = eventDate;
      patch.endDate = eventDate;
      patch.openEnded = false;
    } else if (status !== 'OTHERS') {
      patch.subType = null;
    }
    if (status !== 'PRESENT' && person.status === 'PRESENT') {
      // Fresh absence: default to a span starting today, ending today, so the user chooses the end.
      patch.startDate = eventDate;
      patch.endDate = draft.endDate < eventDate ? eventDate : draft.endDate;
    }
    update(patch);
  };

  const save = () => {
    if (!draft) return;
    if (validation) {
      setError(validation);
      return;
    }
    if (draft.status === 'PRESENT') {
      onSave({ action: 'PRESENT' });
      return;
    }
    onSave({
      action: 'SET',
      status: draft.status,
      subType: draft.status === 'OTHERS' ? draft.subType : null,
      startDate: draft.status === 'RSI' ? eventDate : draft.startDate,
      endDate: draft.status === 'RSI' ? eventDate : draft.openEnded ? null : draft.endDate,
      remark: draft.remark.trim() || null,
    });
  };

  const showDates = !!draft && draft.status !== 'PRESENT' && isMultiDay(draft.status);
  const currentDefault = person.status === 'PRESENT' && !person.confirmed;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="sheet-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onClose={onClose}
    >
      <div className="dialog__handle" aria-hidden="true" />
      <div className="dialog__header">
        <div>
          <h2 id="sheet-title" className="dialog__title">
            {person.rank} {person.name}
          </h2>
          <div className="sheet-current dialog__subtitle">
            Now
            <StatusPill status={person.status} isDefault={currentDefault} />
            <span>{person.status === 'PRESENT' ? (currentDefault ? 'not yet marked' : `for ${eventLabel}`) : describeStatus(person, eventDate).replace(/^[^·]+· /, '')}</span>
          </div>
        </div>
        <Button variant="ghost" small onClick={onClose} disabled={busy} aria-label="Cancel and close">
          Cancel
        </Button>
      </div>

      {draft && (
        <div className="dialog__body">
          <div className="status-grid" role="group" aria-label="Status">
            {(['PRESENT', ...ABSENCE_STATUSES] as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`status-opt status-opt--${s}`}
                aria-pressed={draft.status === s}
                onClick={() => pickStatus(s)}
                title={STATUS_LONG_LABEL[s]}
              >
                {STATUS_LABEL[s]}
                {s !== 'PRESENT' && STATUS_LABEL[s] !== STATUS_LONG_LABEL[s] && <small>{STATUS_LONG_LABEL[s]}</small>}
              </button>
            ))}
          </div>

          {draft.status === 'OTHERS' && (
            <div className="field">
              <span className="field__label" id="subtype-label">Type</span>
              <div className="subtype-grid" role="group" aria-labelledby="subtype-label">
                {OTHERS_SUB_TYPES.map((t) => (
                  <button key={t} type="button" className="subtype-opt" aria-pressed={draft.subType === t} onClick={() => update({ subType: t })}>
                    {SUB_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              {error?.field === 'subType' && <span className="field__error" role="alert">{error.message}</span>}
            </div>
          )}

          {showDates && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">Start date</span>
                  <input
                    className="field__input num"
                    type="date"
                    value={draft.startDate}
                    max={eventDate}
                    aria-invalid={error?.field === 'startDate' || undefined}
                    onChange={(e) => e.target.value && update({ startDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">End date</span>
                  <input
                    className="field__input num"
                    type="date"
                    value={draft.openEnded ? '' : draft.endDate}
                    min={draft.startDate}
                    placeholder="No end date"
                    aria-invalid={error?.field === 'endDate' || undefined}
                    onChange={(e) => (e.target.value ? update({ endDate: e.target.value, openEnded: false }) : update({ openEnded: true }))}
                  />
                </label>
              </div>
              {error && (error.field === 'startDate' || error.field === 'endDate') && (
                <span className="field__error" role="alert">{error.message}</span>
              )}
              {!error && (
                <span className="field__hint">
                  {draft.openEnded
                    ? 'No end date: the status continues until you mark Back to Present.'
                    : draft.endDate === eventDate
                      ? 'Applies to today only.'
                      : `Applies from ${formatSgDateShort(draft.startDate, eventDate)} until ${formatSgDateShort(draft.endDate, eventDate)}, including future parades.`}
                </span>
              )}
              <div className="filters" aria-label="Quick end dates">
                {[0, 1, 2, 6].map((n) => {
                  const d = addDays(eventDate, n);
                  const label = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 6 ? '1 week' : `+${n} days`;
                  return (
                    <button key={n} type="button" className="chip" aria-pressed={!draft.openEnded && draft.endDate === d} onClick={() => update({ endDate: d, openEnded: false })}>
                      {label}
                    </button>
                  );
                })}
                <button type="button" className="chip" aria-pressed={draft.openEnded} onClick={() => update({ openEnded: true })}>
                  No end date
                </button>
              </div>
            </>
          )}

          {draft.status === 'RSI' && (
            <div className="sheet-note">
              <Icon name="info" size={18} />
              <span>
                <strong>RSI applies to {formatSgDateLong(eventDate)} only.</strong> If the person is later given an MC, mark MC with its dates.
              </span>
            </div>
          )}

          {draft.status === 'PRESENT' && ongoingRunsPast && (
            <div className="sheet-note">
              <Icon name="info" size={18} />
              <span>
                <strong>Present marks {eventLabel} only.</strong> The {STATUS_LABEL[person.status]} still runs
                {person.endDate ? ` until ${formatSgDateShort(person.endDate, eventDate)}` : ' with no end date'}. Use <strong>Back to Present</strong> to end it from today.
              </span>
            </div>
          )}

          {draft.status !== 'PRESENT' && (
            <label className="field">
              <span className="field__label">Remark (optional)</span>
              <input
                className="field__input"
                type="text"
                value={draft.remark}
                maxLength={120}
                placeholder={draft.status === 'MC' ? 'e.g. Fever, Bedok Polyclinic' : 'e.g. location or reason'}
                onChange={(e) => update({ remark: e.target.value })}
              />
            </label>
          )}
        </div>
      )}

      <div className="dialog__footer">
        <Button variant="primary" block busy={busy} onClick={save}>
          Save
        </Button>
        {hasOngoingAbsence && (
          <Button variant="ghost" block disabled={busy} onClick={() => onSave({ action: 'BACK_TO_PRESENT' })}>
            Back to Present · ends the {STATUS_LABEL[person.status]}
          </Button>
        )}
      </div>
    </dialog>
  );
}
