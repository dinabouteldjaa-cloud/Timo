import { useState } from 'react';
import Button from '../../components/ui/Button';
import { useLocale } from '../../i18n/LocaleContext';
import type { TaskCategory, TaskPriority } from '../../types/task';
import './AddTaskSheet.css';

interface AddTaskSheetProps {
  open: boolean;
  onClose: () => void;
}

const priorities: TaskPriority[] = ['low', 'medium', 'high'];
const categories: TaskCategory[] = ['work', 'personal', 'health', 'errands', 'learning', 'other'];

export default function AddTaskSheet({ open, onClose }: AddTaskSheetProps) {
  const { t } = useLocale();
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('work');

  if (!open) return null;

  return (
    <div className="add-task-overlay" role="dialog" aria-modal="true" aria-label={t.addTask.title}>
      <div className="add-task-sheet">
        <div className="add-task-sheet__header">
          <button className="add-task-sheet__close" onClick={onClose} aria-label={t.common.close}>
            ✕
          </button>
          <p className="add-task-sheet__title">{t.addTask.title}</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="add-task-sheet__body">
          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.titleLabel}</span>
            <input className="add-task-input" placeholder={t.addTask.titlePlaceholder} />
          </label>

          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.descriptionLabel}</span>
            <textarea
              className="add-task-input add-task-textarea"
              placeholder={t.addTask.descriptionPlaceholder}
              rows={3}
            />
          </label>

          <div className="add-task-row">
            <label className="add-task-field">
              <span className="add-task-field__label">{t.addTask.dateLabel}</span>
              <input className="add-task-input" type="date" />
            </label>
            <label className="add-task-field">
              <span className="add-task-field__label">{t.addTask.timeLabel}</span>
              <input className="add-task-input" type="time" />
            </label>
          </div>

          <div className="add-task-field">
            <span className="add-task-field__label">{t.addTask.priorityLabel}</span>
            <div className="add-task-chip-row">
              {priorities.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`add-task-chip add-task-chip--${p} ${priority === p ? 'add-task-chip--active' : ''}`}
                  onClick={() => setPriority(p)}
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
                  className={`add-task-chip ${category === c ? 'add-task-chip--active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {t.category[c]}
                </button>
              ))}
            </div>
          </div>

          <label className="add-task-field">
            <span className="add-task-field__label">{t.addTask.durationLabel}</span>
            <input className="add-task-input" type="number" placeholder="30" min={0} step={5} />
          </label>
        </div>

        <div className="add-task-sheet__footer">
          <Button fullWidth size="lg" onClick={onClose}>
            {t.addTask.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
