import { useState } from 'react';
import Button from '../../components/ui/Button';
import { useLocale } from '../../i18n/LocaleContext';
import type { NewTaskInput } from '../../state/AppStateContext';
import type { TaskCategory, TaskPriority } from '../../types/task';
import './AddTaskSheet.css';

interface AddTaskSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: NewTaskInput) => void;
}

const priorities: TaskPriority[] = ['low', 'medium', 'high'];
const categories: TaskCategory[] = ['work', 'personal', 'health', 'errands', 'learning', 'other'];

const initialState = {
  title: '',
  description: '',
  date: '',
  time: '',
  priority: 'medium' as TaskPriority,
  category: 'work' as TaskCategory,
  duration: '',
};

export default function AddTaskSheet({ open, onClose, onSave }: AddTaskSheetProps) {
  const { t } = useLocale();
  const [form, setForm] = useState(initialState);
  const [titleTouched, setTitleTouched] = useState(false);

  if (!open) return null;

  const titleError = titleTouched && form.title.trim().length === 0;

  function handleClose() {
    setForm(initialState);
    setTitleTouched(false);
    onClose();
  }

  function handleSave() {
    if (form.title.trim().length === 0) {
      setTitleTouched(true);
      return;
    }
    onSave({
      title: form.title,
      description: form.description || undefined,
      dueDate: form.date || undefined,
      dueTime: form.time || undefined,
      priority: form.priority,
      category: form.category,
      estimatedMinutes: form.duration ? Number(form.duration) : undefined,
    });
    setForm(initialState);
    setTitleTouched(false);
  }

  return (
    <div className="add-task-overlay" role="dialog" aria-modal="true" aria-label={t.addTask.title}>
      <div className="add-task-sheet">
        <div className="add-task-sheet__header">
          <button className="add-task-sheet__close" onClick={handleClose} aria-label={t.common.close}>
            ✕
          </button>
          <p className="add-task-sheet__title">{t.addTask.title}</p>
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
        </div>

        <div className="add-task-sheet__footer">
          <Button fullWidth size="lg" onClick={handleSave}>
            {t.addTask.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
