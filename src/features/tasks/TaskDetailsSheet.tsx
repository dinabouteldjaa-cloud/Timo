import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { formatDuration, toISODate } from '../../lib/utils';
import { formatReminderLabel } from '../../lib/reminderPresets';
import { useLocale } from '../../i18n/LocaleContext';
import type { Reminder, Task } from '../../types/task';
import './TaskDetailsSheet.css';

/** "14:00-15:00" for today's plan, or "Aug 26, 14:00-15:00" for a different day. */
function plannedLabel(date: string, startTime: string, endTime: string): string {
  if (date === toISODate(new Date())) return `${startTime}\u2013${endTime}`;
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );
  return `${dateLabel}, ${startTime}\u2013${endTime}`;
}

interface TaskDetailsSheetProps {
  open: boolean;
  task: Task | null;
  reminder?: Reminder | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  onStartFocus?: () => void;
  /** e.g. "Every Monday", "Daily", "Sun, Tue, Thu" — null/omitted for a non-recurring task. */
  recurrenceLabel?: string | null;
  /**
   * True when the task being viewed is one occurrence of a recurring
   * series (rather than an ordinary task) — switches Edit/Delete to offer
   * "This occurrence" vs "Entire series" instead of acting immediately.
   * When false/omitted, behavior is completely unchanged from before.
   */
  isRecurringOccurrence?: boolean;
  onEditOccurrence?: () => void;
  onEditSeries?: () => void;
  onDeleteOccurrence?: () => void | Promise<void>;
  onDeleteSeries?: () => void | Promise<void>;
}

export default function TaskDetailsSheet({
  open,
  task,
  reminder,
  onClose,
  onEdit,
  onDelete,
  onStartFocus,
  recurrenceLabel,
  isRecurringOccurrence,
  onEditOccurrence,
  onEditSeries,
  onDeleteOccurrence,
  onDeleteSeries,
}: TaskDetailsSheetProps) {
  const { t } = useLocale();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editChoiceOpen, setEditChoiceOpen] = useState(false);
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmingDelete(false);
      setDeleting(false);
      setEditChoiceOpen(false);
      setDeleteChoiceOpen(false);
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

  const offersThisOccurrenceChoice =
    isRecurringOccurrence && onEditOccurrence && onEditSeries && onDeleteOccurrence && onDeleteSeries;

  function handleEditTap() {
    if (offersThisOccurrenceChoice) {
      setEditChoiceOpen(true);
    } else {
      onEdit();
    }
  }

  function handleDeleteTap() {
    if (offersThisOccurrenceChoice) {
      setDeleteChoiceOpen(true);
    } else {
      setConfirmingDelete(true);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteSeriesChoice() {
    if (!onDeleteSeries) return;
    setDeleting(true);
    try {
      await onDeleteSeries();
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteOccurrenceChoice() {
    if (!onDeleteOccurrence) return;
    setDeleting(true);
    try {
      await onDeleteOccurrence();
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

          {recurrenceLabel && <p className="task-details-recurrence">↻ {recurrenceLabel}</p>}

          {onStartFocus && task.status !== 'completed' && (
            <div className="task-details-focus-row">
              <Button variant="secondary" size="sm" onClick={onStartFocus}>
                {t.today.startFocus}
              </Button>
            </div>
          )}

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

          {task.scheduledDate && task.scheduledStartTime && task.scheduledEndTime && (
            <div className="task-details-row">
              <span className="task-details-row__label">Planned</span>
              <span className="task-details-row__value">
                {plannedLabel(task.scheduledDate, task.scheduledStartTime, task.scheduledEndTime)}
              </span>
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

          {editChoiceOpen && (
            <div className="task-details-confirm">
              <p className="task-details-confirm__text">Edit just this occurrence, or the whole series?</p>
              <div className="task-details-confirm__actions">
                <Button variant="ghost" fullWidth onClick={() => setEditChoiceOpen(false)}>
                  Cancel
                </Button>
                <Button variant="secondary" fullWidth onClick={onEditOccurrence}>
                  This occurrence
                </Button>
                <Button fullWidth onClick={onEditSeries}>
                  Entire series
                </Button>
              </div>
            </div>
          )}

          {deleteChoiceOpen && (
            <div className="task-details-confirm">
              <p className="task-details-confirm__text">Remove just this occurrence, or the whole series?</p>
              <div className="task-details-confirm__actions">
                <Button variant="ghost" fullWidth onClick={() => setDeleteChoiceOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="secondary" fullWidth onClick={handleDeleteOccurrenceChoice} disabled={deleting}>
                  This occurrence
                </Button>
                <Button variant="danger" fullWidth onClick={handleDeleteSeriesChoice} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Entire series'}
                </Button>
              </div>
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

        {!confirmingDelete && !editChoiceOpen && !deleteChoiceOpen && (
          <div className="task-details-sheet__footer">
            <Button variant="danger" fullWidth onClick={handleDeleteTap}>
              Delete
            </Button>
            <Button fullWidth onClick={handleEditTap}>
              Edit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
