import type { KeyboardEvent } from 'react';
import type { Task } from '../../types/task';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDuration, toISODate } from '../../lib/utils';
import Checkbox from './Checkbox';
import Badge from './Badge';
import './TaskRow.css';

interface TaskRowProps {
  task: Task;
  onToggle?: (id: string) => void;
  onOpen?: (task: Task) => void;
  hasReminder?: boolean;
}

export default function TaskRow({ task, onToggle, onOpen, hasReminder }: TaskRowProps) {
  const { t } = useLocale();
  const done = task.status === 'completed';

  // A scheduled block only counts if it's for TODAY — a stale (past-day)
  // scheduled_date must never be displayed as if it were today's plan.
  const isScheduledToday =
    task.scheduledDate === toISODate(new Date()) &&
    Boolean(task.scheduledStartTime && task.scheduledEndTime);

  // Built as a list and joined with a single separator, so metadata always
  // reads naturally (e.g. "19:00 • Personal" or "1h 20m • Work") — no
  // dangling/standalone separators appear when a field is missing.
  const metaParts: string[] = [];
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
    <div
      className={`task-row ${done ? 'task-row--done' : ''} ${onOpen ? 'task-row--clickable' : ''}`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
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
      <Badge tone={task.priority}>{t.priority[task.priority]}</Badge>
    </div>
  );
}
