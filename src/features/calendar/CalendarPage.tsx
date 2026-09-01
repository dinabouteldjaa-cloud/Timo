import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import IconButton from '../../components/ui/IconButton';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import { addDays, getWeekDates, parseISODate, toISODate } from '../../lib/utils';
import type { CalendarEvent, Task } from '../../types/task';
import AddEventSheet from './AddEventSheet';
import EventDetailsSheet from './EventDetailsSheet';
import AddTaskSheet from '../tasks/AddTaskSheet';
import TaskDetailsSheet from '../tasks/TaskDetailsSheet';
import './CalendarPage.css';

type View = 'month' | 'week' | 'day';

// A single row in the merged agenda: either a real calendar event or a task
// with a due date, shown side by side but never stored together — tasks
// stay in `tasks`, events stay in `calendar_events`.
type AgendaItem =
  | { kind: 'event'; sortKey: number; event: CalendarEvent }
  | { kind: 'task'; sortKey: number; task: Task };

const TODAY_ISO = toISODate(new Date());

function buildMonthGrid(reference: Date) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isoForDay(reference: Date, day: number) {
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Moves a date forward/back by whole months, keeping the same day-of-month
 * when the target month has that many days, otherwise clamping to the
 * target month's last day (e.g. Jan 31 -> Feb 28/29). Year rollover
 * (Dec -> Jan, Jan -> Dec) is handled automatically by JS Date's own
 * month-overflow normalization — no manual special-casing needed.
 */
function addMonths(dateISO: string, delta: number): string {
  const current = parseISODate(dateISO);
  const day = current.getDate();
  const targetYear = current.getFullYear();
  const targetMonth = current.getMonth() + delta;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return toISODate(new Date(targetYear, targetMonth, clampedDay));
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function CalendarPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const {
    events,
    eventsLoading,
    eventsError,
    addEvent,
    updateEvent,
    deleteEvent,
    tasks,
    updateTask,
    deleteTask,
    reminders,
    selectFocusTask,
  } = useAppState();

  const [view, setView] = useState<View>('month');
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO);

  const [eventSheetOpen, setEventSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailsEvent, setDetailsEvent] = useState<CalendarEvent | null>(null);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);

  const referenceMonth = parseISODate(selectedDate);
  const cells = buildMonthGrid(referenceMonth);
  const weekDates = getWeekDates(selectedDate);

  // Union of dates that have a calendar event OR a task due — used for the
  // small dot indicators in Month/Week views.
  const markedDates = useMemo(() => {
    const set = new Set(events.map((e) => e.eventDate));
    tasks.forEach((task) => {
      if (task.dueDate) set.add(task.dueDate);
      if (task.scheduledDate) set.add(task.scheduledDate);
    });
    return set;
  }, [events, tasks]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    const eventItems: AgendaItem[] = events
      .filter((event) => event.eventDate === selectedDate)
      .map((event) => ({
        kind: 'event' as const,
        event,
        sortKey: event.allDay || !event.startTime ? -1 : toMinutes(event.startTime),
      }));

    const taskItems: AgendaItem[] = tasks
      .filter(
        (task) => task.dueDate === selectedDate || task.scheduledDate === selectedDate,
      )
      .map((task) => {
        const scheduledForThisDay = task.scheduledDate === selectedDate && task.scheduledStartTime;
        const displayTime = scheduledForThisDay ? task.scheduledStartTime : task.dueTime;
        return {
          kind: 'task' as const,
          task,
          sortKey: displayTime ? toMinutes(displayTime) : 24 * 60,
        };
      });

    return [...eventItems, ...taskItems].sort((a, b) => a.sortKey - b.sortKey);
  }, [events, tasks, selectedDate]);

  const agendaLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(parseISODate(selectedDate));

  function openAdd() {
    setEditingEvent(null);
    setEventSheetOpen(true);
  }

  function openEventDetails(event: CalendarEvent) {
    setDetailsEvent(event);
  }

  function closeEventDetails() {
    setDetailsEvent(null);
  }

  function editEventFromDetails() {
    if (!detailsEvent) return;
    setEditingEvent(detailsEvent);
    setDetailsEvent(null);
    setEventSheetOpen(true);
  }

  function closeEventSheet() {
    setEventSheetOpen(false);
    setEditingEvent(null);
  }

  function openTaskDetails(task: Task) {
    setDetailsTask(task);
  }

  function closeTaskDetails() {
    setDetailsTask(null);
  }

  function editTaskFromDetails() {
    if (!detailsTask) return;
    setEditingTask(detailsTask);
    setDetailsTask(null);
    setTaskSheetOpen(true);
  }

  function startFocusFromDetails() {
    if (!detailsTask) return;
    selectFocusTask(detailsTask.id);
    setDetailsTask(null);
    navigate('/focus');
  }

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setEditingTask(null);
  }

  return (
    <>
      <Header title={t.calendar.title} />

      <div className="calendar-page">
        <div className="calendar-view-switch">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button
              key={v}
              className={`calendar-view-btn ${view === v ? 'calendar-view-btn--active' : ''}`}
              onClick={() => setView(v)}
            >
              {t.calendar[v]}
            </button>
          ))}
        </div>

        {eventsError && <p className="calendar-error-banner">{eventsError}</p>}

        {view === 'month' && (
          <Card padding="md">
            <div className="calendar-month-nav">
              <IconButton
                size="sm"
                aria-label="Previous month"
                onClick={() => setSelectedDate((d) => addMonths(d, -1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
              <p className="calendar-month-label">
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(referenceMonth)}
              </p>
              <IconButton
                size="sm"
                aria-label="Next month"
                onClick={() => setSelectedDate((d) => addMonths(d, 1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
            </div>
            <div className="calendar-grid calendar-grid--headers">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="calendar-grid__weekday">
                  {d}
                </span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((day, i) => {
                const iso = day ? isoForDay(referenceMonth, day) : null;
                const isToday = iso === TODAY_ISO;
                const isSelected = iso === selectedDate;
                const hasEvent = iso && markedDates.has(iso);
                return (
                  <button
                    key={i}
                    className={`calendar-cell ${isToday ? 'calendar-cell--today' : ''} ${
                      isSelected && !isToday ? 'calendar-cell--selected' : ''
                    } ${!day ? 'calendar-cell--empty' : ''}`}
                    onClick={() => iso && setSelectedDate(iso)}
                    disabled={!day}
                  >
                    {day && <span>{day}</span>}
                    {hasEvent && <span className="calendar-cell__dot" />}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {view === 'week' && (
          <Card padding="md">
            <div className="calendar-week-strip">
              {weekDates.map((iso) => {
                const date = parseISODate(iso);
                const isToday = iso === TODAY_ISO;
                const isSelected = iso === selectedDate;
                const hasEvent = markedDates.has(iso);
                return (
                  <button
                    key={iso}
                    className={`calendar-week-day ${isSelected ? 'calendar-week-day--selected' : ''} ${
                      isToday ? 'calendar-week-day--today' : ''
                    }`}
                    onClick={() => setSelectedDate(iso)}
                  >
                    <span className="calendar-week-day__label">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}
                    </span>
                    <span className="calendar-week-day__num">{date.getDate()}</span>
                    {hasEvent && <span className="calendar-cell__dot" />}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {view === 'day' && (
          <Card padding="md">
            <div className="calendar-day-nav">
              <IconButton
                size="sm"
                aria-label="Previous day"
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
              <p className="calendar-day-nav__label">{agendaLabel}</p>
              <IconButton
                size="sm"
                aria-label="Next day"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
            </div>
          </Card>
        )}

        <div>
          <p className="calendar-section-label">{agendaLabel}</p>
          <Card padding="md">
            {eventsLoading ? (
              <p className="calendar-loading">Loading your calendar…</p>
            ) : agendaItems.length === 0 ? (
              <div className="calendar-empty">
                <p className="calendar-empty__title">{t.calendar.noEvents}</p>
                <p className="calendar-empty__subtitle">{t.calendar.noEventsSubtitle}</p>
              </div>
            ) : (
              agendaItems.map((item) =>
                item.kind === 'event' ? (
                  <button
                    key={`event-${item.event.id}`}
                    className="calendar-event-row calendar-event-row--clickable"
                    onClick={() => openEventDetails(item.event)}
                  >
                    <div className="calendar-event-row__time">
                      {item.event.allDay ? 'All day' : item.event.startTime ?? ''}
                    </div>
                    <div className="calendar-event-row__line" />
                    <div className="calendar-event-row__body">
                      <p className="calendar-event-row__title">
                        {item.event.title}
                        {reminders.some((r) => r.eventId === item.event.id) && (
                          <svg
                            className="calendar-event-row__reminder-icon"
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
                            <path
                              d="M10 19.5a2 2 0 004 0"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                      </p>
                      {item.event.location && (
                        <p className="calendar-event-row__meta">{item.event.location}</p>
                      )}
                    </div>
                    <Badge tone={item.event.eventType === 'meeting' ? 'success' : 'neutral'}>
                      {item.event.eventType === 'meeting' ? 'Meeting' : 'Event'}
                    </Badge>
                  </button>
                ) : (
                  <button
                    key={`task-${item.task.id}`}
                    className="calendar-event-row calendar-event-row--clickable"
                    onClick={() => openTaskDetails(item.task)}
                  >
                    <div className="calendar-event-row__time">
                      {item.task.scheduledDate === selectedDate &&
                      item.task.scheduledStartTime &&
                      item.task.scheduledEndTime
                        ? `${item.task.scheduledStartTime}–${item.task.scheduledEndTime}`
                        : item.task.dueTime ?? ''}
                    </div>
                    <div className="calendar-event-row__line" />
                    <div className="calendar-event-row__body">
                      <p className="calendar-event-row__title">
                        {item.task.title}
                        {reminders.some((r) => r.taskId === item.task.id) && (
                          <svg
                            className="calendar-event-row__reminder-icon"
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
                            <path
                              d="M10 19.5a2 2 0 004 0"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                      </p>
                    </div>
                    <Badge tone="primary">Task</Badge>
                  </button>
                ),
              )
            )}
          </Card>
        </div>
      </div>

      <IconButton aria-label="Add event" className="calendar-fab" onClick={openAdd}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </IconButton>

      <AddEventSheet
        open={eventSheetOpen}
        event={editingEvent}
        existingReminder={
          editingEvent ? reminders.find((r) => r.eventId === editingEvent.id) ?? null : null
        }
        defaultDate={selectedDate}
        onClose={closeEventSheet}
        onSave={async (input) => {
          if (editingEvent) {
            await updateEvent(editingEvent.id, input);
          } else {
            await addEvent(input);
          }
          closeEventSheet();
        }}
        onDelete={
          editingEvent
            ? async () => {
                await deleteEvent(editingEvent.id);
                closeEventSheet();
              }
            : undefined
        }
      />

      <EventDetailsSheet
        open={Boolean(detailsEvent)}
        event={detailsEvent}
        reminder={detailsEvent ? reminders.find((r) => r.eventId === detailsEvent.id) ?? null : null}
        onClose={closeEventDetails}
        onEdit={editEventFromDetails}
        onDelete={async () => {
          if (!detailsEvent) return;
          await deleteEvent(detailsEvent.id);
          closeEventDetails();
        }}
      />

      <AddTaskSheet
        open={taskSheetOpen}
        task={editingTask}
        existingReminder={
          editingTask ? reminders.find((r) => r.taskId === editingTask.id) ?? null : null
        }
        onClose={closeTaskSheet}
        onSave={async (input) => {
          if (editingTask) {
            await updateTask(editingTask.id, input);
          }
          closeTaskSheet();
        }}
        onDelete={
          editingTask
            ? async () => {
                await deleteTask(editingTask.id);
                closeTaskSheet();
              }
            : undefined
        }
      />

      <TaskDetailsSheet
        open={Boolean(detailsTask)}
        task={detailsTask}
        reminder={detailsTask ? reminders.find((r) => r.taskId === detailsTask.id) ?? null : null}
        onClose={closeTaskDetails}
        onEdit={editTaskFromDetails}
        onStartFocus={startFocusFromDetails}
        onDelete={async () => {
          if (!detailsTask) return;
          await deleteTask(detailsTask.id);
          closeTaskDetails();
        }}
      />
    </>
  );
}
