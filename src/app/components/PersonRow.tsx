import { memo } from 'react';
import { formatSgDateShort, type IsoDate } from '@shared/dates';
import { STATUS_LABEL, SUB_TYPE_LABEL } from '@shared/statuses';
import type { EffectiveStatus } from '@shared/types';
import { StatusPill } from './StatusPill';
import './PersonRow.css';

interface PersonRowProps {
  person: EffectiveStatus;
  eventDate: IsoDate;
  pending?: boolean;
  disabled?: boolean;
  onOpen: (person: EffectiveStatus) => void;
}

/** 'MC · Until 8 Sep' / 'Others · Course, until 11 Sep' / 'Not yet marked' */
export function describeStatus(p: EffectiveStatus, eventDate: IsoDate): string {
  if (p.status === 'PRESENT') return p.confirmed ? 'Present' : 'Not yet marked · counted as Present';
  const parts: string[] = [];
  if (p.status === 'OTHERS' && p.subType) parts.push(SUB_TYPE_LABEL[p.subType]);
  if (p.status === 'RSI' || (p.startDate === eventDate && p.endDate === eventDate)) parts.push('Today only');
  else if (p.endDate) parts.push(p.endDate === eventDate ? 'Until today' : `Until ${formatSgDateShort(p.endDate, eventDate)}`);
  else parts.push('No end date');
  return `${STATUS_LABEL[p.status]} · ${parts.join(', ')}`;
}

export const PersonRow = memo(function PersonRow({ person, eventDate, pending, disabled, onOpen }: PersonRowProps) {
  const isDefault = person.status === 'PRESENT' && !person.confirmed;
  return (
    <li>
      <button
        type="button"
        className="person"
        disabled={disabled}
        onClick={() => onOpen(person)}
        aria-label={`${person.rank} ${person.name}, ${describeStatus(person, eventDate)}. Change status`}
      >
        <span className="person__main">
          <span className="person__name truncate">{person.name}</span>
          <span className="person__meta">
            <span className="person__rank">{person.rank}</span>
            <span className="person__detail truncate">
              {person.status === 'PRESENT' ? (isDefault ? 'Not yet marked' : '') : describeStatus(person, eventDate).replace(/^[^·]+· /, '')}
              {person.remark && person.status !== 'PRESENT' ? ` · ${person.remark}` : ''}
            </span>
          </span>
        </span>
        <span className="person__side">
          {pending && <span className="person__pending" aria-label="Saving" role="status" />}
          <StatusPill status={person.status} isDefault={isDefault} />
        </span>
      </button>
    </li>
  );
});
