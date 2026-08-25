import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import type { NewReminderInput } from '../../state/AppStateContext';
import { localDateTimeToISOString, isoStringToLocalDateTime, toISODate } from '../../lib/utils';
import type { CalendarEvent, Reminder, Task } from '../../types/task';
import './AddReminderSheet.css';

interface AddReminderSheetProps {
  open: boolean;
  reminder?: Reminder | null;
  tasks: Task[];
  events: CalendarEvent[];
  onClose: () => void;
  onSave: (input: NewReminderInput) => void | Promise<void>;
}

function emptyForm() {
  const now = new Date();
  return {
    title: '',
    notes: '',
    date: toISODate(now),
    time: '',
    taskId: '',
    eventId: '',
  };
}

function formFromReminder(reminder: Reminder) {
  const { date, time } = isoStringToLocalDateTime(reminder.remindAt);
  return {
    title: reminder.title,
    notes: reminder.notes ?? '',
    date,
    time,
    taskId: reminder.taskId ?? '',
    eventId: reminder.eventId ?? '',
  };
}

export default function AddReminderSheet({
  open,
  reminder,
  tasks,
  events,
  onClose,
  onSave,
}: AddReminderSheetProps) {
  const [form, setForm] = useState(reminder ? formFromReminder(reminder) : emptyForm());
  const [titleTouched, setTitleTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(reminder);

  useEffect(() => {
    if (open) {
      setForm(reminder ? formFromReminder(reminder) : emptyForm());
      setTitleTouched(false);
      setDateTouched(false);
      setTimeTouched(false);
      setSaving(false);
    }
  }, [open, reminder]);

  if (!open) return null;

  const titleError = titleTouched && form.title.trim().length === 0;
  const dateError = dateTouched && form.date.trim().length === 0;
  const timeError = timeTouched && form.time.trim().length === 0;

  function handleClose() {
    onClose();
  }

  async function handleSave() {
    const titleInvalid = form.title.trim().length === 0;
    const dateInvalid = form.date.trim().length === 0;
    const timeInvalid = form.time.trim().length === 0;
    if (titleInvalid || dateInvalid || timeInvalid) {
      setTitleTouched(true);
      setDateTouched(true);
      setTimeTouched(true);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        notes: form.notes || undefined,
        remindAt: localDateTimeToISOString(form.date, form.time),
        taskId: form.taskId || undefined,
        eventId: form.eventId || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-reminder-overlay" role="dialog" aria-modal="true" aria-label="Reminder details">
      <div className="add-reminder-sheet">
        <div className="add-reminder-sheet__header">
          <button className="add-reminder-sheet__close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
          <p className="add-reminder-sheet__title">{isEditing ? 'Edit reminder' : 'New reminder'}</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="add-reminder-sheet__body">
          <label className="add-reminder-field">
            <span className="add-reminder-field__label">Title</span>
            <input
              className={`add-reminder-input ${titleError ? 'add-reminder-input--error' : ''}`}
              placeholder="What do you want to be reminded of?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onBlur={() => setTitleTouched(true)}
            />
            {titleError && <span className="add-reminder-field__error">A title is required.</span>}
          </label>

          <label className="add-reminder-field">
            <span className="add-reminder-field__label">Notes</span>
            <textarea
              className="add-reminder-input add-reminder-textarea"
              placeholder="Add more detail (optional)"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <div className="add-reminder-row">
            <label className="add-reminder-field">
              <span className="add-reminder-field__label">Date</span>
              <input
                className={`add-reminder-input ${dateError ? 'add-reminder-input--error' : ''}`}
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                onBlur={() => setDateTouched(true)}
              />
              {dateError && <span className="add-reminder-field__error">Required.</span>}
            </label>
            <label className="add-reminder-field">
              <span className="add-reminder-field__label">Time</span>
              <input
                className={`add-reminder-input ${timeError ? 'add-reminder-input--error' : ''}`}
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                onBlur={() => setTimeTouched(true)}
              />
              {timeError && <span className="add-reminder-field__error">Required.</span>}
            </label>
          </div>

          <label className="add-reminder-field">
            <span className="add-reminder-field__label">Link to task (optional)</span>
            <select
              className="add-reminder-input"
              value={form.taskId}
              onChange={(e) => setForm((f) => ({ ...f, taskId: e.target.value, eventId: '' }))}
            >
              <option value="">None</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <label className="add-reminder-field">
            <span className="add-reminder-field__label">Link to event/meeting (optional)</span>
            <select
              className="add-reminder-input"
              value={form.eventId}
              onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value, taskId: '' }))}
            >
              <option value="">None</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="add-reminder-sheet__footer">
          <Button fullWidth size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save reminder'}
          </Button>
        </div>
      </div>
    </div>
  );
}
