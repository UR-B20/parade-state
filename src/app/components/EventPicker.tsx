import type { EventDto } from '@shared/types';
import type { IsoDate } from '@shared/dates';
import { Icon } from './Icon';
import './EventPicker.css';

interface EventPickerProps {
  date: IsoDate;
  events: EventDto[] | undefined;
  selectedId: string | null;
  onSelect: (eventId: string) => void;
  onDateChange: (date: IsoDate) => void;
  /** Ad hoc events can only be created by S1. */
  onCreateAdhoc?: () => void;
}

export function EventPicker({ date, events, selectedId, onSelect, onDateChange, onCreateAdhoc }: EventPickerProps) {
  const am = events?.find((e) => e.type === 'AM');
  const pm = events?.find((e) => e.type === 'PM');
  const adhoc = events?.filter((e) => e.type === 'ADHOC') ?? [];
  const selectedAdhoc = adhoc.find((e) => e.id === selectedId);

  return (
    <div className="event-picker">
      <div className="segmented" role="group" aria-label="Event">
        <button type="button" className="segmented__option" aria-pressed={!!am && selectedId === am.id} disabled={!am} onClick={() => am && onSelect(am.id)}>
          AM parade
        </button>
        <button type="button" className="segmented__option" aria-pressed={!!pm && selectedId === pm.id} disabled={!pm} onClick={() => pm && onSelect(pm.id)}>
          PM parade
        </button>
        {adhoc.length > 0 || onCreateAdhoc ? (
          <AdhocOption
            adhoc={adhoc}
            selected={selectedAdhoc}
            onSelect={onSelect}
            onCreate={onCreateAdhoc}
          />
        ) : null}
      </div>
      <label className="event-picker__date" title="Change date">
        <Icon name="calendar" />
        <span className="visually-hidden">Date</span>
        <input type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)} />
      </label>
    </div>
  );
}

function AdhocOption({ adhoc, selected, onSelect, onCreate }: { adhoc: EventDto[]; selected: EventDto | undefined; onSelect: (id: string) => void; onCreate?: () => void }) {
  // One ad hoc event: a plain toggle. Several (or S1 who can create): a native select for reliability on mobile.
  if (adhoc.length === 1 && !onCreate) {
    const only = adhoc[0]!;
    return (
      <button type="button" className="segmented__option" aria-pressed={selected?.id === only.id} onClick={() => onSelect(only.id)}>
        <span className="truncate">{only.label}</span>
      </button>
    );
  }
  return (
    <label className="segmented__option" aria-pressed={!!selected} style={{ position: 'relative' }}>
      <span className="truncate">{selected ? selected.label : 'Ad hoc'}</span>
      <Icon name="chevronDown" size={16} />
      <select
        aria-label="Ad hoc event"
        value={selected?.id ?? ''}
        onChange={(e) => {
          if (e.target.value === '__new') onCreate?.();
          else if (e.target.value) onSelect(e.target.value);
        }}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
      >
        <option value="" disabled>
          Choose an ad hoc event
        </option>
        {adhoc.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
        {onCreate && <option value="__new">Create ad hoc event…</option>}
      </select>
    </label>
  );
}
