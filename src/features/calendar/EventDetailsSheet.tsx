import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { parseISODate } from '../../lib/utils';
import type { CalendarEvent } from '../../types/task';
import './EventDetailsSheet.css';

interface EventDetailsSheetProps {
  open: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
}

export default function EventDetailsSheet({
  open,
  event,
  onClose,
  onEdit,
  onDelete,
}: EventDetailsSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmingDelete(false);
      setDeleting(false);
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

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
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

        {!confirmingDelete && (
          <div className="event-details-sheet__footer">
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
