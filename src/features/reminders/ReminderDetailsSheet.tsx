import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { formatLocalShortDate, formatLocalTime } from '../../lib/utils';
import type { CalendarEvent, Reminder, Task } from '../../types/task';
import './ReminderDetailsSheet.css';

interface ReminderDetailsSheetProps {
  open: boolean;
  reminder: Reminder | null;
  tasks: Task[];
  events: CalendarEvent[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}

export default function ReminderDetailsSheet({
  open,
  reminder,
  tasks,
  events,
  onClose,
  onEdit,
  onDelete,
}: ReminderDetailsSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmingDelete(false);
      setDeleting(false);
    }
  }, [open, reminder]);

  if (!open || !reminder) return null;

  const linkedTask = reminder.taskId ? tasks.find((task) => task.id === reminder.taskId) : undefined;
  const linkedEvent = reminder.eventId ? events.find((event) => event.id === reminder.eventId) : undefined;

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="reminder-details-overlay" role="dialog" aria-modal="true" aria-label="Reminder details">
      <div className="reminder-details-sheet">
        <div className="reminder-details-sheet__header">
          <button className="reminder-details-sheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <p className="reminder-details-sheet__title">Reminder details</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="reminder-details-sheet__body">
          <div className="reminder-details-top">
            <p className="reminder-details-name">{reminder.title}</p>
            {reminder.completed && <Badge tone="success">Completed</Badge>}
          </div>

          <div className="reminder-details-row">
            <span className="reminder-details-row__label">Date</span>
            <span className="reminder-details-row__value">
              {formatLocalShortDate(reminder.remindAt)}
            </span>
          </div>

          <div className="reminder-details-row">
            <span className="reminder-details-row__label">Time</span>
            <span className="reminder-details-row__value">{formatLocalTime(reminder.remindAt)}</span>
          </div>

          {linkedTask && (
            <div className="reminder-details-row">
              <span className="reminder-details-row__label">Linked task</span>
              <span className="reminder-details-row__value">{linkedTask.title}</span>
            </div>
          )}

          {linkedEvent && (
            <div className="reminder-details-row">
              <span className="reminder-details-row__label">Linked event</span>
              <span className="reminder-details-row__value">{linkedEvent.title}</span>
            </div>
          )}

          {reminder.notes && (
            <div className="reminder-details-description">
              <span className="reminder-details-row__label">Notes</span>
              <p className="reminder-details-description__text">{reminder.notes}</p>
            </div>
          )}

          {confirmingDelete && (
            <div className="reminder-details-confirm">
              <p className="reminder-details-confirm__text">
                Delete this reminder? This can't be undone.
              </p>
              <div className="reminder-details-confirm__actions">
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
          <div className="reminder-details-sheet__footer">
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
