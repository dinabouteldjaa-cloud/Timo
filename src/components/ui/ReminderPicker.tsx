import { RELATIVE_PRESETS, type ReminderPresetKey } from '../../lib/reminderPresets';
import './ReminderPicker.css';

export interface ReminderPickerValue {
  preset: ReminderPresetKey;
  customDate: string;
  customTime: string;
}

interface ReminderPickerProps {
  value: ReminderPickerValue;
  onChange: (value: ReminderPickerValue) => void;
  /** The parent task/event's own local date, if it has one. */
  parentDate?: string;
  /** The parent task/event's own local time, if it has one (absent for all-day events or dateless tasks). */
  parentTime?: string;
  /** Label for the offset-0 preset — "At time" for tasks, "At start time" for events. */
  atLabel?: string;
  customError?: string;
}

export const emptyReminderValue = (): ReminderPickerValue => ({
  preset: 'none',
  customDate: '',
  customTime: '',
});

export default function ReminderPicker({
  value,
  onChange,
  parentDate,
  parentTime,
  atLabel = 'At time',
  customError,
}: ReminderPickerProps) {
  // Relative presets need a real base moment to count backwards from. In
  // addition to the parent's current date/time fields, also keep them
  // available if the picker's current value is already a relative preset
  // (i.e. an existing saved reminder) — otherwise reopening Edit could
  // briefly/incorrectly collapse to None + Custom before the parent's own
  // date/time fields have settled, hiding the very preset that's selected.
  const hasValidParentDateTime = Boolean(parentDate?.trim() && parentTime?.trim());
  const valueIsRelativePreset = RELATIVE_PRESETS.some((p) => p.key === value.preset);
  const canUseRelativePresets = hasValidParentDateTime || valueIsRelativePreset;

  const options: { key: ReminderPresetKey; label: string }[] = [
    { key: 'none', label: 'None' },
    ...(canUseRelativePresets
      ? RELATIVE_PRESETS.map((p) => ({
          key: p.key,
          label: p.key === 'at_time' ? atLabel : p.label,
        }))
      : []),
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="reminder-picker">
      <span className="reminder-picker__label">Reminder</span>
      <div className="reminder-picker__chip-row">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`reminder-picker__chip ${value.preset === opt.key ? 'reminder-picker__chip--active' : ''}`}
            onClick={() => onChange({ ...value, preset: opt.key })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!canUseRelativePresets && (
        <p className="reminder-picker__hint">
          Add a date and time above to unlock relative reminder options, or choose Custom for an
          exact date and time.
        </p>
      )}

      {value.preset === 'custom' && (
        <div className="reminder-picker__custom">
          <p className="reminder-picker__custom-intro">Choose when you want to be reminded</p>
          <div className="reminder-picker__custom-row">
            <label className="reminder-picker__custom-field">
              <span className="reminder-picker__custom-label">Date</span>
              <input
                className="reminder-picker__input"
                type="date"
                value={value.customDate}
                onChange={(e) => onChange({ ...value, customDate: e.target.value })}
              />
            </label>
            <label className="reminder-picker__custom-field">
              <span className="reminder-picker__custom-label">Time</span>
              <input
                className="reminder-picker__input"
                type="time"
                value={value.customTime}
                onChange={(e) => onChange({ ...value, customTime: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {customError && <span className="reminder-picker__error">{customError}</span>}
    </div>
  );
}
