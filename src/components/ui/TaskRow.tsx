import type { Task } from '../../types/task';
import { useLocale } from '../../i18n/LocaleContext';
import { formatDuration } from '../../lib/utils';
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

  return (
    <div className={`task-row ${done ? 'task-row--done' : ''}`}>
      <Checkbox checked={done} onChange={() => onToggle?.(task.id)} aria-label={task.title} />
      <div
        className={`task-row__body ${onOpen ? 'task-row__body--clickable' : ''}`}
        onClick={() => onOpen?.(task)}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
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
        <div className="task-row__meta">
          {task.dueTime && <span className="task-row__time">{task.dueTime}</span>}
          {task.estimatedMinutes && (
            <span className="task-row__duration">{formatDuration(task.estimatedMinutes, t)}</span>
          )}
          <Badge tone={task.category === 'work' ? 'primary' : 'neutral'}>{t.category[task.category]}</Badge>
        </div>
      </div>
      <Badge tone={task.priority}>{t.priority[task.priority]}</Badge>
    </div>
  );
}
