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
import { useLocale } from '../../i18n/LocaleContext';
import type { NewTaskInput, ReminderSelection } from '../../state/AppStateContext';
import { computeRemindAt, minutesForPreset, presetForOffset } from '../../lib/reminderPresets';
import { localDateTimeToISOString, isoStringToLocalDateTime } from '../../lib/utils';
import type { Reminder, Task, TaskCategory, TaskPriority } from '../../types/task';
import './AddTaskSheet.css';

interface AddTaskSheetProps {
  open: boolean;
  task?: Task | null;
  existingReminder?: Reminder | null;
  onClose: () => void;
  onSave: (input: NewTaskInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  /**
   * True when this sheet is creating/editing a single occurrence override
   * of a recurring series ("Edit this occurrence") rather than an
   * ordinary task or the series itself — an occurrence override is
   * always non-recurring, so the Repeat picker doesn't apply and is
   * hidden entirely.
   */
  hideRecurrence?: boolean;
}

const priorities: TaskPriority[] = ['low', 'medium', 'high'];
const categories: TaskCategory[] = ['work', 'personal', 'health', 'errands', 'learning', 'other'];

const emptyForm = {
  title: '',
  description: '',
  date: '',
  time: '',
  priority: 'medium' as TaskPriority,
  category: 'work' as TaskCategory,
  duration: '',
};

function formFromTask(task: Task) {
  return {
    title: task.title,
    description: task.description ?? '',
    date: task.dueDate ?? '',
    time: task.dueTime ?? '',
    priority: task.priority,
    category: task.category,
    duration: task.estimatedMinutes ? String(task.estimatedMinutes) : '',
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

function recurrenceValueFromTask(task?: Task | null): RecurrencePickerValue {
  if (!task) return emptyRecurrenceValue();
  return {
    type: task.recurrenceType ?? 'none',
    daysOfWeek: task.recurrenceDaysOfWeek ?? [],
    endDate: task.recurrenceEndDate ?? '',
  };
}

export default function AddTaskSheet({
  open,
  task,
  existingReminder,
  onClose,
  onSave,
  onDelete,
  hideRecurrence,
}: AddTaskSheetProps) {
  const { t } = useLocale();
  const [form, setForm] = useState(task ? formFromTask(task) : emptyForm);
  const [reminderValue, setReminderValue] = useState<ReminderPickerValue>(
    reminderValueFromExisting(existingReminder),
  );
  const [recurrenceValue, setRecurrenceValue] = useState<RecurrencePickerValue>(
    recurrenceValueFromTask(task),
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(task);

  useEffect(() => {
    if (open) {
      setForm(task ? formFromTask(task) : emptyForm);
      setReminderValue(reminderValueFromExisting(existingReminder));
      setRecurrenceValue(recurrenceValueFromTask(task));
      setTitleTouched(false);
      setReminderError(null);
      setRecurrenceError(null);
      setSaving(false);
    }
  }, [open, task, existingReminder]);

  if (!open) return null;

  const titleError = titleTouched && form.title.trim().length === 0;

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
    // Relative preset — needs the task's own date+time to count back from.
    if (!form.date || !form.time) return 'invalid';
    const minutes = minutesForPreset(reminderValue.preset) ?? 0;
    return {
      remindAt: computeRemindAt(form.date, form.time, minutes),
      offsetMinutes: minutes,
    };
  }

  function validateRecurrence(): string | null {
    if (hideRecurrence || recurrenceValue.type === 'none') return null;
    // Mirrors the DB constraints in 0011_recurring_tasks_events.sql exactly
    // (tasks_recurring_requires_due_date / tasks_custom_recurrence_requires_days /
    // tasks_recurrence_end_not_before_start) so the user sees a clear
    // in-form message instead of a raw database error.
    if (!form.date) return 'A recurring task needs a date to repeat from.';
    if (recurrenceValue.type === 'custom' && recurrenceValue.daysOfWeek.length === 0) {
      return 'Choose at least one day for a custom repeat.';
    }
    if (recurrenceValue.endDate && recurrenceValue.endDate < form.date) {
      return "The end date can't be before the start date.";
    }
    return null;
  }

  async function handleSave() {
    if (form.title.trim().length === 0) {
      setTitleTouched(true);
      return;
    }
    const recurrenceValidationError = validateRecurrence();
    if (recurrenceValidationError) {
      setRecurrenceError(recurrenceValidationError);
      return;
    }
    setRecurrenceError(null);
    const reminder = resolveReminder();
    if (reminder === 'invalid') {
      setReminderError('Add a reminder date and time, or choose a task date/time first.');
      return;
    }
    setReminderError(null);
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        description: form.description || undefined,
        dueDate: form.date || undefined,
        dueTime: form.time || undefined,
        priority: form.priority,
        category: form.category,
        estimatedMinutes: form.duration ? Number(form.duration) : undefined,
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
    <div className="add-task-overlay" role="dialog" aria-modal="true" aria-label={t.addTask.title}>
      <div className="add-task-sheet">
        <div className="add-task-sheet__header">
          <button className="add-task-sheet__close" onClick={handleClose} aria-label={t.common.close}>
            ✕
          </button>
          <p className="add-task-sheet__title">{isEditing ? 'Edit task' : t.addTask.title}</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="add-task-sheet__body">
          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.titleLabel}</span>
            <input
              className={`add-task-input ${titleError ? 'add-task-input--error' : ''}`}
              placeholder={t.addTask.titlePlaceholder}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onBlur={() => setTitleTouched(true)}
            />
            {titleError && <span className="add-task-field__error">A title is required.</span>}
          </label>

          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.descriptionLabel}</span>
            <textarea
              className="add-task-input add-task-textarea"
              placeholder={t.addTask.descriptionPlaceholder}
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>

          <div className="add-task-row">
            <label className="add-task-field">
              <span className="add-task-field__label">{t.addTask.dateLabel}</span>
              <input
                className="add-task-input"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className="add-task-field">
              <span className="add-task-field__label">{t.addTask.timeLabel}</span>
              <input
                className="add-task-input"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </label>
          </div>

          <div className="add-task-field">
            <span className="add-task-field__label">{t.addTask.priorityLabel}</span>
            <div className="add-task-chip-row">
              {priorities.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`add-task-chip add-task-chip--${p} ${form.priority === p ? 'add-task-chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, priority: p }))}
                >
                  {t.priority[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="add-task-field">
            <span className="add-task-field__label">{t.addTask.categoryLabel}</span>
            <div className="add-task-chip-row scroll-row">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`add-task-chip ${form.category === c ? 'add-task-chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, category: c }))}
                >
                  {t.category[c]}
                </button>
              ))}
            </div>
          </div>

          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.durationLabel}</span>
            <input
              className="add-task-input"
              type="number"
              placeholder="30"
              min={0}
              step={5}
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
            />
          </label>

          {!hideRecurrence && (
            <RecurrencePicker value={recurrenceValue} onChange={setRecurrenceValue} error={recurrenceError ?? undefined} />
          )}

          <ReminderPicker
            value={reminderValue}
            onChange={setReminderValue}
            parentDate={form.date || undefined}
            parentTime={form.time || undefined}
            atLabel="At time"
            customError={reminderError ?? undefined}
          />

          {isEditing && onDelete && (
            <button type="button" className="add-task-delete" onClick={handleDelete} disabled={saving}>
              Delete task
            </button>
          )}
        </div>

        <div className="add-task-sheet__footer">
          <Button fullWidth size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : t.addTask.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
