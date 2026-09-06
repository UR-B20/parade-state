import { STATUS_LABEL, STATUSES, type Status } from '@shared/statuses';
import { Icon } from './Icon';
import './Filters.css';

export type RollFilter = 'ALL' | 'ABSENT' | 'UNMARKED' | Status;

interface FilterChipsProps {
  filter: RollFilter;
  onChange: (filter: RollFilter) => void;
  total: number;
  absent: number;
  unmarked: number;
}

export function FilterChips({ filter, onChange, total, absent, unmarked }: FilterChipsProps) {
  const statusValue = filter !== 'ALL' && filter !== 'ABSENT' ? filter : '';
  return (
    <div className="filters" role="group" aria-label="Filter roll">
      <button type="button" className="chip" aria-pressed={filter === 'ALL'} onClick={() => onChange('ALL')}>
        All <span className="chip__count num">{total}</span>
      </button>
      {unmarked > 0 && (
        <button type="button" className="chip" aria-pressed={filter === 'UNMARKED'} onClick={() => onChange('UNMARKED')}>
          Not yet marked <span className="chip__count num">{unmarked}</span>
        </button>
      )}
      <button type="button" className="chip" aria-pressed={filter === 'ABSENT'} onClick={() => onChange('ABSENT')}>
        Absent <span className="chip__count num">{absent}</span>
      </button>
      <label className={`chip chip--select${statusValue && statusValue !== 'UNMARKED' ? ' chip--active' : ''}`}>
        <span>{statusValue && statusValue !== 'UNMARKED' ? STATUS_LABEL[statusValue] : 'Status'}</span>
        <Icon name="chevronDown" size={16} className="chip__caret" />
        <select aria-label="Filter by status" value={statusValue === 'UNMARKED' ? '' : statusValue} onChange={(e) => onChange((e.target.value || 'ALL') as RollFilter)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
