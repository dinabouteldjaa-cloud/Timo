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
}

export default function TaskRow({ task, onToggle, onOpen }: TaskRowProps) {
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
        <p className="task-row__title">{task.title}</p>
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
