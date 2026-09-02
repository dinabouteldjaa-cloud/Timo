import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { parseISODate } from '../../lib/utils';
import { formatReminderLabel } from '../../lib/reminderPresets';
import type { CalendarEvent, Reminder } from '../../types/task';
import './EventDetailsSheet.css';

interface EventDetailsSheetProps {
  open: boolean;
  event: CalendarEvent | null;
  reminder?: Reminder | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  /** e.g. "Every Monday", "Daily", "Sun, Tue, Thu" — null/omitted for a non-recurring event. */
  recurrenceLabel?: string | null;
  /** See TaskDetailsSheet's isRecurringOccurrence — same meaning. */
  isRecurringOccurrence?: boolean;
  onEditOccurrence?: () => void;
  onEditSeries?: () => void;
  onDeleteOccurrence?: () => void | Promise<void>;
  onDeleteSeries?: () => void | Promise<void>;
}

export default function EventDetailsSheet({
  open,
  event,
  reminder,
  onClose,
  onEdit,
  onDelete,
  recurrenceLabel,
  isRecurringOccurrence,
  onEditOccurrence,
  onEditSeries,
  onDeleteOccurrence,
  onDeleteSeries,
}: EventDetailsSheetProps) {
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
  }, [open, event]);

  if (!open || !event) return null;

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseISODate(event.eventDate));

  const timeLabel = event.allDay
    ? 'All day'
    : event.startTime && event.endTime
      ? `${event.startTime} – ${event.endTime}`
      : event.startTime || 'No time set';

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
    <div className="event-details-overlay" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="event-details-sheet">
        <div className="event-details-sheet__header">
          <button className="event-details-sheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <p className="event-details-sheet__title">Event details</p>
          <div style={{ width: 34 }} />
        </div>

        <div className="event-details-sheet__body">
          <div className="event-details-top">
            <p className="event-details-name">{event.title}</p>
            <Badge tone={event.eventType === 'meeting' ? 'success' : 'neutral'}>
              {event.eventType === 'meeting' ? 'Meeting' : 'Event'}
            </Badge>
          </div>

          {recurrenceLabel && <p className="event-details-recurrence">↻ {recurrenceLabel}</p>}

          <div className="event-details-row">
            <span className="event-details-row__label">Date</span>
            <span className="event-details-row__value">{dateLabel}</span>
          </div>

          <div className="event-details-row">
            <span className="event-details-row__label">Time</span>
            <span className="event-details-row__value">{timeLabel}</span>
          </div>

          {event.location && (
            <div className="event-details-row">
              <span className="event-details-row__label">Location</span>
              <span className="event-details-row__value">{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="event-details-description">
              <span className="event-details-row__label">Description</span>
              <p className="event-details-description__text">{event.description}</p>
            </div>
          )}

          {reminder && (
            <div className="event-details-row">
              <span className="event-details-row__label">Reminder</span>
              <span className="event-details-row__value">
                {formatReminderLabel(reminder.remindAt, reminder.offsetMinutes, 'At start time')}
              </span>
            </div>
          )}

          {editChoiceOpen && (
            <div className="event-details-confirm">
              <p className="event-details-confirm__text">Edit just this occurrence, or the whole series?</p>
              <div className="event-details-confirm__actions">
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
            <div className="event-details-confirm">
              <p className="event-details-confirm__text">Remove just this occurrence, or the whole series?</p>
              <div className="event-details-confirm__actions">
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
            <div className="event-details-confirm">
              <p className="event-details-confirm__text">Delete this event? This can't be undone.</p>
              <div className="event-details-confirm__actions">
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
          <div className="event-details-sheet__footer">
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
