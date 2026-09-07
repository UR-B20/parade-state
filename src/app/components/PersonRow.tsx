import { memo } from 'react';
import { formatSgDateShort, type IsoDate } from '@shared/dates';
import { HALF_DAY_HOURS, isSingleDay, statusLabel, SUB_TYPE_LABEL, UNMARKED_LABEL } from '@shared/statuses';
import type { EffectiveStatus } from '@shared/types';
import { StatusPill } from './StatusPill';
import './PersonRow.css';

interface PersonRowProps {
  person: EffectiveStatus;
  eventDate: IsoDate;
  pending?: boolean;
  disabled?: boolean;
  /** Opens the status sheet; `notPresent` preselects Not present. */
  onOpen: (person: EffectiveStatus, notPresent?: boolean) => void;
  /** One-tap Present for an unmarked person. */
  onPresent: (person: EffectiveStatus) => void;
}

/** 'MC · Until 8 Sep' / 'Others · On course, until 11 Sep' / 'LL (PM) · Half day, 1200–1800' / 'Not yet marked' */
export function describeStatus(p: EffectiveStatus, eventDate: IsoDate): string {
  if (p.status === 'UNMARKED') return UNMARKED_LABEL;
  if (p.status === 'PRESENT') return 'Present';
  const parts: string[] = [];
  if (p.status === 'OTHERS' && p.subType) parts.push(SUB_TYPE_LABEL[p.subType]);
  if (p.halfDay) parts.push(`Half day, ${HALF_DAY_HOURS[p.halfDay]}`);
  else if (isSingleDay(p.status) || (p.startDate === eventDate && p.endDate === eventDate)) parts.push('Today only');
  else if (p.endDate) parts.push(p.endDate === eventDate ? 'Until today' : `Until ${formatSgDateShort(p.endDate, eventDate)}`);
  else parts.push('No end date');
  return `${statusLabel(p.status, p.halfDay)} · ${parts.join(', ')}`;
}

/** Secondary line under the name: absence detail, or nothing for a marked Present. */
function detail(p: EffectiveStatus, eventDate: IsoDate): string {
  if (p.status === 'PRESENT' || p.status === 'UNMARKED') return '';
  const base = describeStatus(p, eventDate).replace(/^[^·]+· /, '');
  return p.remark ? `${base} · ${p.remark}` : base;
}

export const PersonRow = memo(function PersonRow({ person, eventDate, pending, disabled, onOpen, onPresent }: PersonRowProps) {
  const unmarked = person.status === 'UNMARKED';
  return (
    <li className={`person${unmarked ? ' person--unmarked' : ''}`}>
      <button
        type="button"
        className="person__body"
        disabled={disabled}
        onClick={() => onOpen(person)}
        aria-label={`${person.rank} ${person.name}, ${describeStatus(person, eventDate)}. Change status`}
      >
        <span className="person__name truncate">{person.name}</span>
        <span className="person__meta">
          <span className="person__rank">{person.rank}</span>
          <span className="person__detail truncate">{detail(person, eventDate)}</span>
        </span>
      </button>
      <span className="person__side">
        {pending && <span className="person__pending" aria-label="Saving" role="status" />}
        {unmarked && !disabled ? (
          <span className="person__choice" role="group" aria-label={`Mark ${person.rank} ${person.name}`}>
            <button type="button" className="choice choice--present" onClick={() => onPresent(person)}>
              Present
            </button>
            <button type="button" className="choice choice--absent" onClick={() => onOpen(person, true)}>
              Not present
            </button>
          </span>
        ) : (
          <button type="button" className="person__pill" disabled={disabled} onClick={() => onOpen(person)} aria-label={`Change status for ${person.name}`}>
            <StatusPill status={person.status} halfDay={person.halfDay} />
          </button>
        )}
      </span>
    </li>
  );
});
