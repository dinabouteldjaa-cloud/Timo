import { useAppState } from '../../state/AppStateContext';
import { useLocale } from '../../i18n/LocaleContext';
import { getOrderedWeekdays } from '../../lib/weekUtils';
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
  const { firstDayOfWeek } = useAppState();
  const { t } = useLocale();
  // DISPLAY order only — the stored day numbers (0=Sun..6=Sat) and
  // toggleDay's own logic below are completely unaffected by this;
  // reordering which button appears first never changes what tapping it
  // stores. See src/lib/weekUtils.ts.
  const orderedWeekdays = getOrderedWeekdays(firstDayOfWeek);

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
          {orderedWeekdays.map((day) => (
            <button
              key={day}
              type="button"
              className={`recurrence-picker__day ${value.daysOfWeek.includes(day) ? 'recurrence-picker__day--active' : ''}`}
              onClick={() => toggleDay(day)}
            >
              {t.weekdays.short[day]}
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
