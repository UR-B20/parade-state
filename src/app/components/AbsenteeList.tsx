import { formatSgDateShort, type IsoDate } from '@shared/dates';
import { STATUS_LABEL, STATUS_LONG_LABEL, SUB_TYPE_LABEL } from '@shared/statuses';
import type { AbsenteeDto, AbsenteesDto } from '@shared/types';
import { StatusPill } from './StatusPill';
import './Admin.css';

function dates(a: AbsenteeDto, eventDate: IsoDate): string {
  if (a.status === 'RSI' || (a.startDate === eventDate && a.endDate === eventDate)) return 'Today only';
  const start = a.startDate ? formatSgDateShort(a.startDate, eventDate) : '';
  const end = a.endDate ? formatSgDateShort(a.endDate, eventDate) : 'no end date';
  if (a.startDate === eventDate) return `From today until ${end}`;
  return `${start} – ${end}`;
}

export function AbsenteeList({ data }: { data: AbsenteesDto }) {
  return (
    <div className="group" style={{ gap: 16 }}>
      {data.groups.map((g) => (
        <section key={g.status} className="group" aria-labelledby={`abs-${g.status}`}>
          <h2 id={`abs-${g.status}`} className="group__title">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <StatusPill status={g.status} />
              <span>{STATUS_LONG_LABEL[g.status] !== STATUS_LABEL[g.status] ? STATUS_LONG_LABEL[g.status] : ''}</span>
            </span>
            <span className="num">{g.items.length}</span>
          </h2>
          <ul className="roll">
            {g.items.map((a) => (
              <li key={a.personId} className="absentee">
                <div className="absentee__main">
                  <span className="absentee__name truncate">
                    <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{a.rank}</span> {a.name}
                  </span>
                  <span className="absentee__meta truncate num">
                    {a.status === 'OTHERS' && a.subType ? `${SUB_TYPE_LABEL[a.subType]} · ` : ''}
                    {dates(a, data.event.date)}
                    {a.remark ? ` · ${a.remark}` : ''}
                  </span>
                </div>
                <span className="absentee__unit">{a.unitName}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
