import Checkbox from '../../components/ui/Checkbox';
import Badge from '../../components/ui/Badge';
import { formatLocalTime } from '../../lib/utils';
import type { CalendarEvent, Reminder, Task } from '../../types/task';
import './ReminderRow.css';

interface ReminderRowProps {
  reminder: Reminder;
  tasks: Task[];
  events: CalendarEvent[];
  onToggle?: (id: string) => void;
  onOpen?: (reminder: Reminder) => void;
}

export default function ReminderRow({ reminder, tasks, events, onToggle, onOpen }: ReminderRowProps) {
  const linkedTask = reminder.taskId ? tasks.find((task) => task.id === reminder.taskId) : undefined;
  const linkedEvent = reminder.eventId ? events.find((event) => event.id === reminder.eventId) : undefined;

  return (
    <div className={`reminder-row ${reminder.completed ? 'reminder-row--done' : ''}`}>
      <Checkbox
        checked={reminder.completed}
        onChange={() => onToggle?.(reminder.id)}
        aria-label={reminder.title}
      />
      <div
        className={`reminder-row__body ${onOpen ? 'reminder-row__body--clickable' : ''}`}
        onClick={() => onOpen?.(reminder)}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        <p className="reminder-row__title">{reminder.title}</p>
        <div className="reminder-row__meta">
          <span className="reminder-row__time">{formatLocalTime(reminder.remindAt)}</span>
          {linkedTask && <Badge tone="primary">{linkedTask.title}</Badge>}
          {linkedEvent && <Badge tone="success">{linkedEvent.title}</Badge>}
        </div>
      </div>
    </div>
  );
}
