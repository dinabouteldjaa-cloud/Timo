import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { formatDuration } from '../../lib/utils';
import { formatReminderLabel } from '../../lib/reminderPresets';
import { useLocale } from '../../i18n/LocaleContext';
import type { Reminder, Task } from '../../types/task';
import './TaskDetailsSheet.css';

interface TaskDetailsSheetProps {
  open: boolean;
  task: Task | null;
  reminder?: Reminder | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}

export default function TaskDetailsSheet({
  open,
  task,
  reminder,
  onClose,
  onEdit,
  onDelete,
}: TaskDetailsSheetProps) {
  const { t } = useLocale();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmingDelete(false);
      setDeleting(false);
    }
  }, [open, task]);

  if (!open || !task) return null;

  const dateLabel = task.dueDate
    ? new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date(`${task.dueDate}T00:00:00`))
    : null;

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="task-details-overlay" role="dialog" aria-modal="true" aria-label="Task details">
      <div className="task-details-sheet">
        <div className="task-details-sheet__header">
          <button className="task-details-sheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <p className="task-details-sheet__title">Task details</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="task-details-sheet__body">
          <div className="task-details-top">
            <p className={`task-details-name ${task.status === 'completed' ? 'task-details-name--done' : ''}`}>
              {task.title}
            </p>
            <Badge tone={task.priority}>{t.priority[task.priority]}</Badge>
          </div>

          <div className="task-details-row">
            <span className="task-details-row__label">Status</span>
            <Badge tone={task.status === 'completed' ? 'success' : 'neutral'}>
              {t.status[task.status]}
            </Badge>
          </div>

          {dateLabel && (
            <div className="task-details-row">
              <span className="task-details-row__label">Due date</span>
              <span className="task-details-row__value">{dateLabel}</span>
            </div>
          )}

          {task.dueTime && (
            <div className="task-details-row">
              <span className="task-details-row__label">Due time</span>
              <span className="task-details-row__value">{task.dueTime}</span>
            </div>
          )}

          <div className="task-details-row">
            <span className="task-details-row__label">Category</span>
            <span className="task-details-row__value">{t.category[task.category]}</span>
          </div>

          {task.estimatedMinutes && (
            <div className="task-details-row">
              <span className="task-details-row__label">Estimated duration</span>
              <span className="task-details-row__value">{formatDuration(task.estimatedMinutes, t)}</span>
            </div>
          )}

          {task.description && (
            <div className="task-details-description">
              <span className="task-details-row__label">Description</span>
              <p className="task-details-description__text">{task.description}</p>
            </div>
          )}

          {reminder && (
            <div className="task-details-row">
              <span className="task-details-row__label">Reminder</span>
              <span className="task-details-row__value">
                {formatReminderLabel(reminder.remindAt, reminder.offsetMinutes, 'At time')}
              </span>
            </div>
          )}

          {confirmingDelete && (
            <div className="task-details-confirm">
              <p className="task-details-confirm__text">Delete this task? This can't be undone.</p>
              <div className="task-details-confirm__actions">
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button variant="danger" fullWidth onClick={handleConfirmDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {!confirmingDelete && (
          <div className="task-details-sheet__footer">
            <Button variant="danger" fullWidth onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
            <Button fullWidth onClick={onEdit}>
              Edit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
