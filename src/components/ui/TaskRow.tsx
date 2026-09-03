import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import type { Task } from '../../types/task';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDuration, toISODate } from '../../lib/utils';
import Checkbox from './Checkbox';
import Badge from './Badge';
import './TaskRow.css';

const MAX_SWIPE = 132; // px — width of the two revealed action buttons
const OPEN_THRESHOLD = 56; // px — how far to drag before it snaps open

interface TaskRowProps {
  task: Task;
  onToggle?: (id: string) => void;
  /** Tap opens read-only details (TaskDetailsSheet) — never edits directly. */
  onOpen?: (task: Task) => void;
  /** Swipe-left "Edit" action. Omit to disable the swipe action entirely. */
  onEditRequest?: (task: Task) => void;
  /** Swipe-left "Delete" action. Omit to disable the swipe action entirely. */
  onDeleteRequest?: (task: Task) => void;
  hasReminder?: boolean;
  /** Shows a small coral "Overdue" label and a subtle warm row accent. */
  overdue?: boolean;
  /** Optional date context shown before time/category, e.g. "Tomorrow" or "Sep 5" — used by Upcoming, where the date isn't otherwise implied by which list the row is in. */
  dateLabel?: string;
  /** Shows a small repeat icon — true when this row represents an occurrence of a recurring series (including an edited "This occurrence" override), not just when the row's own recurrenceType is set. */
  isRecurring?: boolean;
}

export default function TaskRow({
  task,
  onToggle,
  onOpen,
  onEditRequest,
  onDeleteRequest,
  hasReminder,
  overdue,
  dateLabel,
  isRecurring,
}: TaskRowProps) {
  const { t } = useLocale();
  const done = task.status === 'completed';
  const swipeEnabled = Boolean(onEditRequest || onDeleteRequest);

  // --- Swipe-left actions (touch only) ---------------------------------
  // A lightweight, dependency-free drag tracker — no gesture library.
  // Desktop/mouse users simply never trigger these touch events, so the
  // row behaves exactly as a normal clickable row there; every action
  // here remains reachable via TaskDetailsSheet regardless.
  const [dragX, setDragX] = useState(0);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const horizontalSwipe = useRef(false);
  const startedOnCheckbox = useRef(false);

  function closeSwipe() {
    setDragX(0);
    setIsSwipeOpen(false);
  }

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (!swipeEnabled) return;
    // A touch that starts on the checkbox must never be interpreted as
    // the start of a swipe — it's an isolated tap target (see the
    // checkbox wrapper's own stopPropagation below for the click/keyboard
    // equivalent of this same isolation).
    startedOnCheckbox.current = Boolean((e.target as HTMLElement).closest('.task-row__checkbox-wrap'));
    if (startedOnCheckbox.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    horizontalSwipe.current = false;
  }

  function handleTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (!swipeEnabled || startedOnCheckbox.current) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!horizontalSwipe.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // gesture not yet decided
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical scroll intent — abandon swipe tracking for this touch
        // entirely so the page can scroll normally.
        touchStartX.current = null;
        return;
      }
      horizontalSwipe.current = true;
      setDragging(true);
    }

    const base = isSwipeOpen ? -MAX_SWIPE : 0;
    setDragX(Math.min(0, Math.max(-MAX_SWIPE, base + dx)));
  }

  function handleTouchEnd() {
    if (touchStartX.current === null && !horizontalSwipe.current) return;
    touchStartX.current = null;
    touchStartY.current = null;
    setDragging(false);
    if (!horizontalSwipe.current) return;
    horizontalSwipe.current = false;
    if (dragX <= -OPEN_THRESHOLD) {
      setDragX(-MAX_SWIPE);
      setIsSwipeOpen(true);
    } else {
      closeSwipe();
    }
  }

  // A scheduled block only counts if it's for TODAY — a stale (past-day)
  // scheduled_date must never be displayed as if it were today's plan.
  const isScheduledToday =
    task.scheduledDate === toISODate(new Date()) &&
    Boolean(task.scheduledStartTime && task.scheduledEndTime);

  // Built as a list and joined with a single separator, so metadata always
  // reads naturally (e.g. "19:00 • Personal" or "1h 20m • Work") — no
  // dangling/standalone separators appear when a field is missing.
  const metaParts: string[] = [];
  if (dateLabel) metaParts.push(dateLabel);
  if (isScheduledToday) {
    metaParts.push(`${task.scheduledStartTime}–${task.scheduledEndTime}`);
  } else if (task.dueTime) {
    metaParts.push(task.dueTime);
  }
  if (task.estimatedMinutes) {
    metaParts.push(formatDuration(task.estimatedMinutes, t));
  }
  metaParts.push(t.category[task.category]);

  function handleOpen() {
    if (isSwipeOpen) {
      // A tap while swipe actions are revealed closes them first —
      // matches native swipe-action list conventions — rather than also
      // opening details underneath.
      closeSwipe();
      return;
    }
    onOpen?.(task);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  }

  return (
    <div className="task-row-swipe-wrap">
      {swipeEnabled && (
        <div className="task-row-swipe-actions" aria-hidden={!isSwipeOpen}>
          {onEditRequest && (
            <button
              type="button"
              className="task-row-swipe-action task-row-swipe-action--edit"
              tabIndex={isSwipeOpen ? 0 : -1}
              onClick={() => {
                closeSwipe();
                onEditRequest(task);
              }}
            >
              Edit
            </button>
          )}
          {onDeleteRequest && (
            <button
              type="button"
              className="task-row-swipe-action task-row-swipe-action--delete"
              tabIndex={isSwipeOpen ? 0 : -1}
              onClick={() => {
                closeSwipe();
                onDeleteRequest(task);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}

      <div
        className={`task-row ${done ? 'task-row--done' : ''} ${onOpen ? 'task-row--clickable' : ''} ${overdue ? 'task-row--overdue' : ''}`}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : 'transform 0.2s ease' }}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        {/* This wrapper is a plain <div>, not a <button> — it exists only to
            stop the checkbox's click/keyboard activation from also bubbling
            up and opening details. The Checkbox itself is a real <button>
            rendered as a child of this div, which is valid HTML; only a
            literal <button> nested inside another <button> would be invalid,
            and the outer row here is a div with role="button", not one. */}
        <div
          className="task-row__checkbox-wrap"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox checked={done} onChange={() => onToggle?.(task.id)} aria-label={task.title} />
        </div>
        <div className="task-row__body">
          <p className="task-row__title">
            {task.title}
            {isRecurring && (
              <span className="task-row__recurring-icon" aria-label="Recurring task">
                ↻
              </span>
            )}
            {hasReminder && (
              <svg
                className="task-row__reminder-icon"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                aria-label="Reminder set"
              >
                <path
                  d="M12 4a5 5 0 00-5 5v3.2c0 .5-.18.98-.5 1.36L5 15.5c-.6.7-.1 1.8.8 1.8h12.4c.9 0 1.4-1.1.8-1.8l-1.5-1.94a2.1 2.1 0 01-.5-1.36V9a5 5 0 00-5-5z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M10 19.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </p>
          <p className="task-row__meta">{metaParts.join(' • ')}</p>
        </div>
        <div className="task-row__badges">
          {overdue && <Badge tone="overdue">{t.tasks.filterOverdue}</Badge>}
          <Badge tone={task.priority}>{t.priority[task.priority]}</Badge>
        </div>
      </div>
    </div>
  );
}
