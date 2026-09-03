import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import IconButton from '../../components/ui/IconButton';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState, type NewEventInput, type NewTaskInput } from '../../state/AppStateContext';
import { addDays, getWeekDates, parseISODate, toISODate } from '../../lib/utils';
import { expandTaskOccurrences, expandEventOccurrences, type TaskOccurrence, type EventOccurrence } from '../../lib/occurrences';
import { describeRecurrence } from '../../lib/recurrence';
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
  | { kind: 'event'; sortKey: number; occurrence: EventOccurrence }
  | { kind: 'task'; sortKey: number; occurrence: TaskOccurrence };

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
    deleteEventOccurrence,
    saveEventOccurrenceOverride,
    eventOccurrenceSkips,
    tasks,
    updateTask,
    deleteTask,
    deleteTaskOccurrence,
    saveTaskOccurrenceOverride,
    taskOccurrenceCompletions,
    taskOccurrenceSkips,
    reminders,
    selectFocusTask,
  } = useAppState();

  const [view, setView] = useState<View>('month');
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO);

  const [eventSheetOpen, setEventSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventSheetHidesRecurrence, setEventSheetHidesRecurrence] = useState(false);
  const [eventOverrideContext, setEventOverrideContext] = useState<{ seriesId: string; date: string } | null>(null);
  const [detailsEventOccurrence, setDetailsEventOccurrence] = useState<EventOccurrence | null>(null);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskSheetHidesRecurrence, setTaskSheetHidesRecurrence] = useState(false);
  const [taskOverrideContext, setTaskOverrideContext] = useState<{ seriesId: string; date: string } | null>(null);
  const [detailsTaskOccurrence, setDetailsTaskOccurrence] = useState<TaskOccurrence | null>(null);

  const referenceMonth = parseISODate(selectedDate);
  const cells = buildMonthGrid(referenceMonth);
  const weekDates = getWeekDates(selectedDate);

  // The calendar month currently on screen — used to expand recurring
  // series into concrete dates for dot indicators and the agenda. Padded
  // by a few days on each side so a week that spans a month boundary
  // still gets correct dots for the days it shares with this month.
  const monthRangeStart = toISODate(new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), 1 - 7));
  const monthRangeEnd = toISODate(new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + 1, 7));

  const expandedTasks = useMemo(
    () => expandTaskOccurrences(tasks, monthRangeStart, monthRangeEnd, taskOccurrenceCompletions, taskOccurrenceSkips),
    [tasks, monthRangeStart, monthRangeEnd, taskOccurrenceCompletions, taskOccurrenceSkips],
  );
  const expandedEvents = useMemo(
    () => expandEventOccurrences(events, monthRangeStart, monthRangeEnd, eventOccurrenceSkips),
    [events, monthRangeStart, monthRangeEnd, eventOccurrenceSkips],
  );

  // Union of dates that have a calendar event OR a task due — used for the
  // small dot indicators in Month/Week views. Now includes every expanded
  // recurring occurrence, not just each series' own stored start date.
  const markedDates = useMemo(() => {
    const set = new Set(expandedEvents.map((e) => e.date));
    expandedTasks.forEach((t) => set.add(t.date));
    tasks.forEach((task) => {
      if (task.scheduledDate) set.add(task.scheduledDate);
    });
    return set;
  }, [expandedEvents, expandedTasks, tasks]);

  const agendaItems = useMemo<AgendaItem[]>(() => {
    const eventItems: AgendaItem[] = expandedEvents
      .filter((occ) => occ.date === selectedDate)
      .map((occ) => ({
        kind: 'event' as const,
        occurrence: occ,
        sortKey: occ.event.allDay || !occ.event.startTime ? -1 : toMinutes(occ.event.startTime),
      }));

    const taskItems: AgendaItem[] = expandedTasks
      .filter((occ) => occ.date === selectedDate)
      .map((occ) => {
        const scheduledForThisDay = occ.task.scheduledDate === selectedDate && occ.task.scheduledStartTime;
        const displayTime = scheduledForThisDay ? occ.task.scheduledStartTime : occ.task.dueTime;
        return {
          kind: 'task' as const,
          occurrence: occ,
          sortKey: displayTime ? toMinutes(displayTime) : 24 * 60,
        };
      });

    // Also include scheduled-but-not-otherwise-occurring tasks (Plan My
    // Day placements) for this date, same as before.
    const scheduledOnly: AgendaItem[] = tasks
      .filter(
        (task) =>
          task.scheduledDate === selectedDate &&
          !expandedTasks.some((occ) => occ.seriesId === task.id && occ.date === selectedDate) &&
          task.dueDate !== selectedDate,
      )
      .map((task) => ({
        kind: 'task' as const,
        occurrence: {
          virtualId: `${task.id}::${selectedDate}`,
          date: selectedDate,
          task,
          seriesId: task.id,
          isRecurring: false,
          completed: task.status === 'completed',
        },
        sortKey: task.scheduledStartTime ? toMinutes(task.scheduledStartTime) : 24 * 60,
      }));

    return [...eventItems, ...taskItems, ...scheduledOnly].sort((a, b) => a.sortKey - b.sortKey);
  }, [expandedEvents, expandedTasks, tasks, selectedDate]);

  const agendaLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(parseISODate(selectedDate));

  function openAdd() {
    setEditingEvent(null);
    setEventSheetHidesRecurrence(false);
    setEventOverrideContext(null);
    setEventSheetOpen(true);
  }

  function openEventDetails(occurrence: EventOccurrence) {
    setDetailsEventOccurrence(occurrence);
  }

  function closeEventDetails() {
    setDetailsEventOccurrence(null);
  }

  /** "Entire series" edit — always edits the series' own stored row, whichever date is currently viewed. */
  function editEventSeries() {
    if (!detailsEventOccurrence) return;
    const series = events.find((e) => e.id === detailsEventOccurrence.seriesId) ?? detailsEventOccurrence.event;
    setEditingEvent(series);
    setEventSheetHidesRecurrence(false);
    setEventOverrideContext(null);
    setDetailsEventOccurrence(null);
    setEventSheetOpen(true);
  }

  /** "This occurrence" edit — prefills with this occurrence's effective data, anchored to its own date. */
  function editEventOccurrence() {
    if (!detailsEventOccurrence) return;
    const occ = detailsEventOccurrence;
    setEditingEvent({ ...occ.event, eventDate: occ.date });
    setEventSheetHidesRecurrence(true);
    setEventOverrideContext({ seriesId: occ.seriesId, date: occ.date });
    setDetailsEventOccurrence(null);
    setEventSheetOpen(true);
  }

  async function deleteEventSeries() {
    if (!detailsEventOccurrence) return;
    await deleteEvent(detailsEventOccurrence.seriesId);
    setDetailsEventOccurrence(null);
  }

  async function deleteEventOccurrenceChoice() {
    if (!detailsEventOccurrence) return;
    const occ = detailsEventOccurrence;
    const overrideId = occ.event.recurrenceParentId ? occ.event.id : undefined;
    await deleteEventOccurrence(occ.seriesId, occ.date, overrideId);
    setDetailsEventOccurrence(null);
  }

  function closeEventSheet() {
    setEventSheetOpen(false);
    setEditingEvent(null);
    setEventSheetHidesRecurrence(false);
    setEventOverrideContext(null);
  }

  async function handleEventSheetSave(input: NewEventInput) {
    if (eventOverrideContext) {
      await saveEventOccurrenceOverride(eventOverrideContext.seriesId, eventOverrideContext.date, input);
    } else if (editingEvent) {
      await updateEvent(editingEvent.id, input);
    } else {
      await addEvent(input);
    }
    closeEventSheet();
  }

  function openTaskDetails(occurrence: TaskOccurrence) {
    setDetailsTaskOccurrence(occurrence);
  }

  function closeTaskDetails() {
    setDetailsTaskOccurrence(null);
  }

  function editTaskSeries() {
    if (!detailsTaskOccurrence) return;
    const series = tasks.find((tsk) => tsk.id === detailsTaskOccurrence.seriesId) ?? detailsTaskOccurrence.task;
    setEditingTask(series);
    setTaskSheetHidesRecurrence(false);
    setTaskOverrideContext(null);
    setDetailsTaskOccurrence(null);
    setTaskSheetOpen(true);
  }

  function editTaskOccurrence() {
    if (!detailsTaskOccurrence) return;
    const occ = detailsTaskOccurrence;
    setEditingTask({ ...occ.task, dueDate: occ.date });
    setTaskSheetHidesRecurrence(true);
    setTaskOverrideContext({ seriesId: occ.seriesId, date: occ.date });
    setDetailsTaskOccurrence(null);
    setTaskSheetOpen(true);
  }

  async function deleteTaskSeries() {
    if (!detailsTaskOccurrence) return;
    await deleteTask(detailsTaskOccurrence.seriesId);
    setDetailsTaskOccurrence(null);
  }

  async function deleteTaskOccurrenceChoice() {
    if (!detailsTaskOccurrence) return;
    const occ = detailsTaskOccurrence;
    const overrideId = occ.task.recurrenceParentId ? occ.task.id : undefined;
    await deleteTaskOccurrence(occ.seriesId, occ.date, overrideId);
    setDetailsTaskOccurrence(null);
  }

  function startFocusFromDetails() {
    if (!detailsTaskOccurrence) return;
    selectFocusTask(detailsTaskOccurrence.task.id);
    setDetailsTaskOccurrence(null);
    navigate('/focus');
  }

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setEditingTask(null);
    setTaskSheetHidesRecurrence(false);
    setTaskOverrideContext(null);
  }

  async function handleTaskSheetSave(input: NewTaskInput) {
    if (taskOverrideContext) {
      await saveTaskOccurrenceOverride(taskOverrideContext.seriesId, taskOverrideContext.date, input);
    } else if (editingTask) {
      await updateTask(editingTask.id, input);
    }
    closeTaskSheet();
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
                    disabled={!day}
                    onClick={() => iso && setSelectedDate(iso)}
                  >
                    {day && (
                      <>
                        <span>{day}</span>
                        {hasEvent && <span className="calendar-cell__dot" />}
                      </>
                    )}
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
                    key={`event-${item.occurrence.virtualId}`}
                    className="calendar-event-row calendar-event-row--clickable"
                    onClick={() => openEventDetails(item.occurrence)}
                  >
                    <div className="calendar-event-row__time">
                      {item.occurrence.event.allDay ? 'All day' : item.occurrence.event.startTime ?? ''}
                    </div>
                    <div className="calendar-event-row__line" />
                    <div className="calendar-event-row__body">
                      <p className="calendar-event-row__title">
                        {item.occurrence.event.title}
                        {item.occurrence.isRecurring && <span className="calendar-event-row__recurring">↻</span>}
                        {reminders.some((r) => r.eventId === item.occurrence.event.id) && (
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
                      {item.occurrence.event.location && (
                        <p className="calendar-event-row__meta">{item.occurrence.event.location}</p>
                      )}
                    </div>
                    <Badge tone={item.occurrence.event.eventType === 'meeting' ? 'success' : 'neutral'}>
                      {item.occurrence.event.eventType === 'meeting' ? 'Meeting' : 'Event'}
                    </Badge>
                  </button>
                ) : (
                  <button
                    key={`task-${item.occurrence.virtualId}`}
                    className="calendar-event-row calendar-event-row--clickable"
                    onClick={() => openTaskDetails(item.occurrence)}
                  >
                    <div className="calendar-event-row__time">
                      {item.occurrence.task.scheduledDate === selectedDate &&
                      item.occurrence.task.scheduledStartTime &&
                      item.occurrence.task.scheduledEndTime
                        ? `${item.occurrence.task.scheduledStartTime}–${item.occurrence.task.scheduledEndTime}`
                        : item.occurrence.task.dueTime ?? ''}
                    </div>
                    <div className="calendar-event-row__line" />
                    <div className="calendar-event-row__body">
                      <p className="calendar-event-row__title">
                        {item.occurrence.task.title}
                        {item.occurrence.isRecurring && <span className="calendar-event-row__recurring">↻</span>}
                        {reminders.some((r) => r.taskId === item.occurrence.task.id) && (
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
        hideRecurrence={eventSheetHidesRecurrence}
        onClose={closeEventSheet}
        onSave={handleEventSheetSave}
        onDelete={
          editingEvent && !eventOverrideContext
            ? async () => {
                await deleteEvent(editingEvent.id);
                closeEventSheet();
              }
            : undefined
        }
      />

      <EventDetailsSheet
        open={Boolean(detailsEventOccurrence)}
        event={
          detailsEventOccurrence
            ? { ...detailsEventOccurrence.event, eventDate: detailsEventOccurrence.date }
            : null
        }
        reminder={
          detailsEventOccurrence
            ? reminders.find((r) => r.eventId === detailsEventOccurrence.event.id) ?? null
            : null
        }
        recurrenceLabel={
          detailsEventOccurrence?.isRecurring
            ? describeRecurrence(
                {
                  type: (events.find((e) => e.id === detailsEventOccurrence.seriesId) ?? detailsEventOccurrence.event)
                    .recurrenceType,
                  daysOfWeek: (events.find((e) => e.id === detailsEventOccurrence.seriesId) ?? detailsEventOccurrence.event)
                    .recurrenceDaysOfWeek,
                },
                (events.find((e) => e.id === detailsEventOccurrence.seriesId) ?? detailsEventOccurrence.event).eventDate,
              )
            : null
        }
        isRecurringOccurrence={detailsEventOccurrence?.isRecurring}
        onClose={closeEventDetails}
        onEdit={editEventSeries}
        onEditOccurrence={editEventOccurrence}
        onEditSeries={editEventSeries}
        onDeleteOccurrence={deleteEventOccurrenceChoice}
        onDeleteSeries={deleteEventSeries}
        onDelete={async () => {
          if (!detailsEventOccurrence) return;
          await deleteEvent(detailsEventOccurrence.seriesId);
          closeEventDetails();
        }}
      />

      <AddTaskSheet
        open={taskSheetOpen}
        task={editingTask}
        existingReminder={
          editingTask ? reminders.find((r) => r.taskId === editingTask.id) ?? null : null
        }
        hideRecurrence={taskSheetHidesRecurrence}
        onClose={closeTaskSheet}
        onSave={handleTaskSheetSave}
        onDelete={
          editingTask && !taskOverrideContext
            ? async () => {
                await deleteTask(editingTask.id);
                closeTaskSheet();
              }
            : undefined
        }
      />

      <TaskDetailsSheet
        open={Boolean(detailsTaskOccurrence)}
        task={
          detailsTaskOccurrence
            ? {
                ...detailsTaskOccurrence.task,
                dueDate: detailsTaskOccurrence.date,
                // Fix: detailsTaskOccurrence.task is the SERIES PARENT
                // for a non-override occurrence — its own `status`
                // column is never meant to reflect any single
                // occurrence's completion (that lives in
                // task_occurrence_completions). Use the occurrence's own
                // computed `completed` flag instead, exactly as
                // TodayPage/TasksPage's synthetic display objects
                // already do — an override's own status is unaffected
                // either way, since detailsTaskOccurrence.completed is
                // already derived from the override's own status in
                // that case (see expandTaskOccurrences).
                status: detailsTaskOccurrence.completed ? 'completed' : 'todo',
              }
            : null
        }
        reminder={
          detailsTaskOccurrence
            ? reminders.find((r) => r.taskId === detailsTaskOccurrence.task.id) ?? null
            : null
        }
        recurrenceLabel={
          detailsTaskOccurrence?.isRecurring
            ? describeRecurrence(
                {
                  type: (tasks.find((tsk) => tsk.id === detailsTaskOccurrence.seriesId) ?? detailsTaskOccurrence.task)
                    .recurrenceType,
                  daysOfWeek: (tasks.find((tsk) => tsk.id === detailsTaskOccurrence.seriesId) ?? detailsTaskOccurrence.task)
                    .recurrenceDaysOfWeek,
                },
                (tasks.find((tsk) => tsk.id === detailsTaskOccurrence.seriesId) ?? detailsTaskOccurrence.task).dueDate ??
                  detailsTaskOccurrence.date,
              )
            : null
        }
        isRecurringOccurrence={detailsTaskOccurrence?.isRecurring}
        onClose={closeTaskDetails}
        onEdit={editTaskSeries}
        onEditOccurrence={editTaskOccurrence}
        onEditSeries={editTaskSeries}
        onDeleteOccurrence={deleteTaskOccurrenceChoice}
        onDeleteSeries={deleteTaskSeries}
        onStartFocus={startFocusFromDetails}
        onDelete={async () => {
          if (!detailsTaskOccurrence) return;
          await deleteTask(detailsTaskOccurrence.seriesId);
          closeTaskDetails();
        }}
      />
    </>
  );
}
