import type { RecurrenceType } from '../../types/task';
import './RecurrencePicker.css';

export interface RecurrencePickerValue {
  type: RecurrenceType;
  /** 0=Sun..6=Sat — only used/shown when type === 'custom'. */
  daysOfWeek: number[];
  /** '' means never-ending. */
  endDate: string;
}

export const emptyRecurrenceValue = (): RecurrencePickerValue => ({
  type: 'none',
  daysOfWeek: [],
  endDate: '',
});

const WEEKDAYS: { key: number; label: string }[] = [
  { key: 0, label: 'Sun' },
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
];

const TYPE_OPTIONS: { key: RecurrenceType; label: string }[] = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
];

interface RecurrencePickerProps {
  value: RecurrencePickerValue;
  onChange: (value: RecurrencePickerValue) => void;
  error?: string;
}

export default function RecurrencePicker({ value, onChange, error }: RecurrencePickerProps) {
  function toggleDay(day: number) {
    const has = value.daysOfWeek.includes(day);
    onChange({
      ...value,
      daysOfWeek: has ? value.daysOfWeek.filter((d) => d !== day) : [...value.daysOfWeek, day].sort(),
    });
  }

  return (
    <div className="recurrence-picker">
      <span className="recurrence-picker__label">Repeat</span>
      <div className="recurrence-picker__chip-row">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`recurrence-picker__chip ${value.type === opt.key ? 'recurrence-picker__chip--active' : ''}`}
            onClick={() => onChange({ ...value, type: opt.key })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.type === 'custom' && (
        <div className="recurrence-picker__weekdays">
          {WEEKDAYS.map((day) => (
            <button
              key={day.key}
              type="button"
              className={`recurrence-picker__day ${value.daysOfWeek.includes(day.key) ? 'recurrence-picker__day--active' : ''}`}
              onClick={() => toggleDay(day.key)}
            >
              {day.label}
            </button>
          ))}
        </div>
      )}

      {value.type !== 'none' && (
        <label className="recurrence-picker__end-field">
          <span className="recurrence-picker__end-label">Ends</span>
          <div className="recurrence-picker__end-row">
            <button
              type="button"
              className={`recurrence-picker__chip ${!value.endDate ? 'recurrence-picker__chip--active' : ''}`}
              onClick={() => onChange({ ...value, endDate: '' })}
            >
              Never
            </button>
            <input
              className="recurrence-picker__end-date"
              type="date"
              value={value.endDate}
              onChange={(e) => onChange({ ...value, endDate: e.target.value })}
              placeholder="On date"
            />
          </div>
        </label>
      )}

      {error && <span className="recurrence-picker__error">{error}</span>}
    </div>
  );
}
