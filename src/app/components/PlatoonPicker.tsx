import type { PlatoonCounts, PlatoonDto } from '@shared/types';
import './Filters.css';
import './Admin.css';

export const ALL_PLATOONS = 'ALL';
export const NO_PLATOON = 'NONE';

interface PlatoonPickerProps {
  platoons: PlatoonCounts[];
  selected: string;
  onChange: (id: string) => void;
  strength: number;
}

/** Chips to scope the roll to one platoon. Only rendered for units that have platoons. */
export function PlatoonPicker({ platoons, selected, onChange, strength }: PlatoonPickerProps) {
  if (platoons.length === 0) return null;
  return (
    <div className="filters" role="group" aria-label="Platoon">
      <button type="button" className="chip" aria-pressed={selected === ALL_PLATOONS} onClick={() => onChange(ALL_PLATOONS)}>
        Whole Coy <span className="chip__count num">{strength}</span>
      </button>
      {platoons.map((p) => {
        const id = p.platoon?.id ?? NO_PLATOON;
        return (
          <button key={id} type="button" className="chip" aria-pressed={selected === id} onClick={() => onChange(id)}>
            {p.platoon?.name ?? 'Unassigned'} <span className="chip__count num">{p.counts.strength}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact per-platoon strength table shown under the unit figure. */
export function PlatoonBreakdown({ platoons, onSelect }: { platoons: PlatoonCounts[]; onSelect?: (id: string) => void }) {
  if (platoons.length === 0) return null;
  return (
    <ul className="platoon-list" aria-label="Strength by platoon">
      {platoons.map((p) => {
        const id = p.platoon?.id ?? NO_PLATOON;
        const pct = p.counts.strength ? Math.round((p.counts.present / p.counts.strength) * 100) : 0;
        const body = (
          <>
            <span className="platoon-list__name truncate">{p.platoon?.name ?? 'Unassigned'}</span>
            <span className="platoon-list__bar" aria-hidden="true">
              <span className="platoon-list__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="platoon-list__figure num">
              <strong>{p.counts.present}</strong> / {p.counts.strength}
              {p.counts.unmarked > 0 && <span className="platoon-list__unmarked"> · {p.counts.unmarked} to mark</span>}
            </span>
          </>
        );
        return (
          <li key={id}>
            {onSelect ? (
              <button type="button" className="platoon-list__row" onClick={() => onSelect(id)} aria-label={`${p.platoon?.name ?? 'Unassigned'}: ${p.counts.present} of ${p.counts.strength} present`}>
                {body}
              </button>
            ) : (
              <div className="platoon-list__row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function platoonName(platoons: PlatoonDto[], id: string | null): string {
  return platoons.find((p) => p.id === id)?.name ?? 'Unassigned';
}
