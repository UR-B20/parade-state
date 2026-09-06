import { Icon } from './Icon';
import './Filters.css';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchField({ value, onChange, placeholder = 'Search name or rank', label = 'Search name or rank' }: SearchFieldProps) {
  return (
    <div className="search">
      <Icon name="search" className="search__icon" />
      <input
        className="search__input"
        type="search"
        inputMode="search"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search__clear" aria-label="Clear search" onClick={() => onChange('')}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}
