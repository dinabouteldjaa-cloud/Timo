import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import ReminderPicker, {
  emptyReminderValue,
  type ReminderPickerValue,
} from '../../components/ui/ReminderPicker';
import RecurrencePicker, {
  emptyRecurrenceValue,
  type RecurrencePickerValue,
} from '../../components/ui/RecurrencePicker';
import type { NewEventInput, ReminderSelection } from '../../state/AppStateContext';
import { computeRemindAt, minutesForPreset, presetForOffset } from '../../lib/reminderPresets';
import { localDateTimeToISOString, isoStringToLocalDateTime } from '../../lib/utils';
import type { CalendarEvent, CalendarEventType, Reminder } from '../../types/task';
import './AddEventSheet.css';

interface AddEventSheetProps {
  open: boolean;
  event?: CalendarEvent | null;
  existingReminder?: Reminder | null;
  defaultDate?: string;
  onClose: () => void;
  onSave: (input: NewEventInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  /** See AddTaskSheet's hideRecurrence — same meaning, for "Edit this occurrence" of a recurring event. */
  hideRecurrence?: boolean;
}

const eventTypes: CalendarEventType[] = ['event', 'meeting'];

function emptyForm(defaultDate?: string) {
  return {
    title: '',
    description: '',
    date: defaultDate ?? '',
    startTime: '',
    endTime: '',
    allDay: false,
    location: '',
    eventType: 'event' as CalendarEventType,
  };
}

function formFromEvent(event: CalendarEvent) {
  return {
    title: event.title,
    description: event.description ?? '',
    date: event.eventDate,
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    allDay: event.allDay,
    location: event.location ?? '',
    eventType: event.eventType,
  };
}

function reminderValueFromExisting(reminder?: Reminder | null): ReminderPickerValue {
  if (!reminder) return emptyReminderValue();
  const { date, time } = isoStringToLocalDateTime(reminder.remindAt);
  return {
    preset: presetForOffset(reminder.offsetMinutes),
    customDate: date,
    customTime: time,
  };
}

function recurrenceValueFromEvent(event?: CalendarEvent | null): RecurrencePickerValue {
  if (!event) return emptyRecurrenceValue();
  return {
    type: event.recurrenceType ?? 'none',
    daysOfWeek: event.recurrenceDaysOfWeek ?? [],
    endDate: event.recurrenceEndDate ?? '',
  };
}

export default function AddEventSheet({
  open,
  event,
  existingReminder,
  defaultDate,
  onClose,
  onSave,
  onDelete,
  hideRecurrence,
}: AddEventSheetProps) {
  const [form, setForm] = useState(event ? formFromEvent(event) : emptyForm(defaultDate));
  const [reminderValue, setReminderValue] = useState<ReminderPickerValue>(
    reminderValueFromExisting(existingReminder),
  );
  const [recurrenceValue, setRecurrenceValue] = useState<RecurrencePickerValue>(
    recurrenceValueFromEvent(event),
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(event);

  useEffect(() => {
    if (open) {
      setForm(event ? formFromEvent(event) : emptyForm(defaultDate));
      setReminderValue(reminderValueFromExisting(existingReminder));
      setRecurrenceValue(recurrenceValueFromEvent(event));
      setTitleTouched(false);
      setDateTouched(false);
      setReminderError(null);
      setSaving(false);
    }
  }, [open, event, existingReminder, defaultDate]);

  if (!open) return null;

  const titleError = titleTouched && form.title.trim().length === 0;
  const dateError = dateTouched && form.date.trim().length === 0;

  function handleClose() {
    onClose();
  }

  function resolveReminder(): ReminderSelection | null | 'invalid' {
    if (reminderValue.preset === 'none') return null;
    if (reminderValue.preset === 'custom') {
      if (!reminderValue.customDate || !reminderValue.customTime) return 'invalid';
      return {
        remindAt: localDateTimeToISOString(reminderValue.customDate, reminderValue.customTime),
      };
    }
    // Relative preset — needs the event's own date + start time (all-day
    // events have no start time, so relative presets aren't offered then).
    if (!form.date || form.allDay || !form.startTime) return 'invalid';
    const minutes = minutesForPreset(reminderValue.preset) ?? 0;
    return {
      remindAt: computeRemindAt(form.date, form.startTime, minutes),
      offsetMinutes: minutes,
    };
  }

  async function handleSave() {
    const titleInvalid = form.title.trim().length === 0;
    const dateInvalid = form.date.trim().length === 0;
    if (titleInvalid || dateInvalid) {
      setTitleTouched(true);
      setDateTouched(true);
      return;
    }
    const reminder = resolveReminder();
    if (reminder === 'invalid') {
      setReminderError('Add a reminder date and time, or choose an event start time first.');
      return;
    }
    setReminderError(null);
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        description: form.description || undefined,
        eventDate: form.date,
        startTime: form.allDay ? undefined : form.startTime || undefined,
        endTime: form.allDay ? undefined : form.endTime || undefined,
        allDay: form.allDay,
        location: form.location || undefined,
        eventType: form.eventType,
        reminder,
        recurrenceType: hideRecurrence ? 'none' : recurrenceValue.type,
        recurrenceDaysOfWeek:
          !hideRecurrence && recurrenceValue.type === 'custom' ? recurrenceValue.daysOfWeek : undefined,
        recurrenceEndDate: !hideRecurrence && recurrenceValue.endDate ? recurrenceValue.endDate : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-event-overlay" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="add-event-sheet">
        <div className="add-event-sheet__header">
          <button className="add-event-sheet__close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
          <p className="add-event-sheet__title">{isEditing ? 'Edit event' : 'New event'}</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="add-event-sheet__body">
          <label className="add-event-field">
            <span className="add-event-field__label">Title</span>
            <input
              className={`add-event-input ${titleError ? 'add-event-input--error' : ''}`}
              placeholder="What's the event?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onBlur={() => setTitleTouched(true)}
            />
            {titleError && <span className="add-event-field__error">A title is required.</span>}
          </label>

          <label className="add-event-field">
            <span className="add-event-field__label">Description</span>
            <textarea
              className="add-event-input add-event-textarea"
              placeholder="Add more detail (optional)"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>

          <label className="add-event-field">
            <span className="add-event-field__label">Date</span>
            <input
              className={`add-event-input ${dateError ? 'add-event-input--error' : ''}`}
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              onBlur={() => setDateTouched(true)}
            />
            {dateError && <span className="add-event-field__error">A date is required.</span>}
          </label>

          <div className="add-event-field">
            <span className="add-event-field__label">Timing</span>
            <div className="add-event-chip-row">
              <button
                type="button"
                className={`add-event-chip ${!form.allDay ? 'add-event-chip--active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, allDay: false }))}
              >
                Has time
              </button>
              <button
                type="button"
                className={`add-event-chip ${form.allDay ? 'add-event-chip--active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, allDay: true }))}
              >
                All day
              </button>
            </div>
          </div>

          {!form.allDay && (
            <div className="add-event-row">
              <label className="add-event-field">
                <span className="add-event-field__label">Start time</span>
                <input
                  className="add-event-input"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </label>
              <label className="add-event-field">
                <span className="add-event-field__label">End time</span>
                <input
                  className="add-event-input"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </label>
            </div>
          )}

          <div className="add-event-field">
            <span className="add-event-field__label">Type</span>
            <div className="add-event-chip-row">
              {eventTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`add-event-chip ${form.eventType === type ? 'add-event-chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, eventType: type }))}
                >
                  {type === 'event' ? 'Event' : 'Meeting'}
                </button>
              ))}
            </div>
          </div>

          <label className="add-event-field">
            <span className="add-event-field__label">Location</span>
            <input
              className="add-event-input"
              placeholder="Optional"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </label>

          {!hideRecurrence && <RecurrencePicker value={recurrenceValue} onChange={setRecurrenceValue} />}

          <ReminderPicker
            value={reminderValue}
            onChange={setReminderValue}
            parentDate={form.date || undefined}
            parentTime={form.allDay ? undefined : form.startTime || undefined}
            atLabel="At start time"
            customError={reminderError ?? undefined}
          />

          {isEditing && onDelete && (
            <button type="button" className="add-event-delete" onClick={handleDelete} disabled={saving}>
              Delete event
            </button>
          )}
        </div>

        <div className="add-event-sheet__footer">
          <Button fullWidth size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save event'}
          </Button>
        </div>
      </div>
    </div>
  );
}
