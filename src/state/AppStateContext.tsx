import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  CalendarEvent,
  CalendarEventType,
  FocusSessionRecord,
  RecurrenceType,
  Reminder,
  Task,
  TaskCategory,
  TaskPriority,
} from '../types/task';
import { toISODate } from '../lib/utils';
import { useAuth } from './AuthContext';
import * as tasksApi from '../lib/tasksApi';
import * as eventsApi from '../lib/calendarEventsApi';
import * as remindersApi from '../lib/remindersApi';
import * as focusSessionsApi from '../lib/focusSessionsApi';
import type { ReminderSchedule } from '../lib/remindersApi';

// ---------------------------------------------------------------------------
// Shared app state.
//
// Tasks and calendar events are both backed by Supabase (see
// src/lib/tasksApi.ts and src/lib/calendarEventsApi.ts) and scoped to the
// signed-in user via RLS. The focus session/timer below is still purely
// local/in-memory — focus session persistence is a later phase.
//
// Reminders are NOT a standalone item: a reminder is purely "when Timo
// should notify the user about a Task or Event", configured from within
// that task/event's own sheet. addTask/updateTask/addEvent/updateEvent
// below accept an optional `reminder` selection and handle creating,
// replacing, or clearing the associated reminder row as part of the same
// save. Deleting a task/event cascades its reminder at the database level
// (see supabase/migrations/0005_reminders_refactor.sql).
// ---------------------------------------------------------------------------

export type ReminderSelection = ReminderSchedule;

export interface NewTaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority: TaskPriority;
  category: TaskCategory;
  estimatedMinutes?: number;
  /** null = no reminder / clear the existing one. */
  reminder: ReminderSelection | null;
  /** Omitted/undefined means 'none' — an ordinary, non-recurring task. */
  recurrenceType?: RecurrenceType;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
}

export interface NewEventInput {
  title: string;
  description?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  eventType: CalendarEventType;
  /** null = no reminder / clear the existing one. */
  reminder: ReminderSelection | null;
  recurrenceType?: RecurrenceType;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
}

type FocusStatus = 'idle' | 'running' | 'paused' | 'completed';

interface FocusSessionState {
  status: FocusStatus;
  durationMinutes: number;
  secondsLeft: number;
  selectedTaskId: string | null;
  // Real wall-clock start of the current run, captured once when a fresh
  // session begins (not reset across pause/resume). Used to build the
  // started_at/ended_at pair saved to Supabase — see persistFocusSession.
  startedAt: string | null;
}

interface TodayFocusSummary {
  sessionsToday: number;
  secondsToday: number;
}

interface AppStateValue {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  addTask: (input: NewTaskInput) => Promise<Task>;
  updateTask: (id: string, input: NewTaskInput) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setTaskSchedule: (
    id: string,
    schedule: { date: string; startTime: string; endTime: string } | null,
  ) => Promise<void>;

  // Recurrence — see supabase/migrations/0011_recurring_tasks_events.sql
  // and src/lib/occurrences.ts. Sparse `${id}::${date}` key sets; only
  // completed/skipped occurrences ever appear here.
  taskOccurrenceCompletions: Set<string>;
  taskOccurrenceSkips: Set<string>;
  eventOccurrenceSkips: Set<string>;
  setTaskOccurrenceCompletion: (taskId: string, occurrenceDate: string, completed: boolean) => Promise<void>;
  deleteTaskOccurrence: (seriesId: string, occurrenceDate: string, overrideTaskId?: string) => Promise<void>;
  saveTaskOccurrenceOverride: (seriesId: string, occurrenceDate: string, input: NewTaskInput) => Promise<Task>;
  deleteEventOccurrence: (seriesId: string, occurrenceDate: string, overrideEventId?: string) => Promise<void>;
  saveEventOccurrenceOverride: (
    seriesId: string,
    occurrenceDate: string,
    input: NewEventInput,
  ) => Promise<CalendarEvent>;

  events: CalendarEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  upcomingEvent: CalendarEvent | null;
  addEvent: (input: NewEventInput) => Promise<CalendarEvent>;
  updateEvent: (id: string, input: NewEventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Read-only: reminders are normally mutated only via the task/event
  // calls above. attachTaskReminder/attachEventReminder below are the one
  // exception — a narrow, throwing action for a caller that creates a
  // task/event first and attaches a reminder as a separate, precisely
  // trackable step (currently Brain Dump).
  reminders: Reminder[];
  remindersLoading: boolean;
  remindersError: string | null;
  attachTaskReminder: (taskId: string, reminder: ReminderSelection) => Promise<Reminder>;
  attachEventReminder: (eventId: string, reminder: ReminderSelection) => Promise<Reminder>;

  focusSession: FocusSessionState;
  focusHistory: FocusSessionRecord[];
  focusHistoryLoading: boolean;
  focusHistoryError: string | null;
  todayFocusSummary: TodayFocusSummary;
  selectFocusTask: (id: string) => void;
  selectFocusDuration: (minutes: number) => void;
  startFocus: () => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  endFocus: () => void;
}

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

const DEFAULT_DURATION = 25;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // --- Reminders (loaded once per session; mutated only via tasks/events) --
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setReminders([]);
      setRemindersError(null);
      return;
    }
    let cancelled = false;
    setRemindersLoading(true);
    setRemindersError(null);
    remindersApi
      .fetchReminders(userId)
      .then((loaded) => {
        if (!cancelled) setReminders(loaded);
      })
      .catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[AppState] fetchReminders failed', err);
        if (!cancelled) setRemindersError(err.message || 'Could not load reminders.');
      })
      .finally(() => {
        if (!cancelled) setRemindersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Applies a reminder selection for a task, after the task itself has been saved. Never throws — surfaces via remindersError instead, so a reminder-save failure never undoes a successful task/event save. */
  const applyTaskReminder = useCallback(
    async (taskId: string, reminder: ReminderSelection | null) => {
      if (!userId) return;
      try {
        if (reminder) {
          const saved = await remindersApi.upsertReminderForTask(userId, taskId, reminder);
          setReminders((prev) => [...prev.filter((r) => r.taskId !== taskId), saved]);
        } else {
          await remindersApi.clearReminderForTask(taskId);
          setReminders((prev) => prev.filter((r) => r.taskId !== taskId));
        }
        setRemindersError(null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] applyTaskReminder failed', err);
        setRemindersError(
          err instanceof Error ? err.message : 'The task was saved, but its reminder could not be saved.',
        );
      }
    },
    [userId],
  );

  const applyEventReminder = useCallback(
    async (eventId: string, reminder: ReminderSelection | null) => {
      if (!userId) return;
      try {
        if (reminder) {
          const saved = await remindersApi.upsertReminderForEvent(userId, eventId, reminder);
          setReminders((prev) => [...prev.filter((r) => r.eventId !== eventId), saved]);
        } else {
          await remindersApi.clearReminderForEvent(eventId);
          setReminders((prev) => prev.filter((r) => r.eventId !== eventId));
        }
        setRemindersError(null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] applyEventReminder failed', err);
        setRemindersError(
          err instanceof Error ? err.message : 'The event was saved, but its reminder could not be saved.',
        );
      }
    },
    [userId],
  );

  /**
   * Attaches a reminder to an ALREADY-CREATED task. Unlike applyTaskReminder
   * above (used by the Add/Edit Task sheet, which never throws so a
   * reminder failure can't undo a just-saved task in that single combined
   * flow), this DOES throw on failure and keeps the local `reminders`
   * state in sync itself. It exists for callers — currently Brain Dump —
   * that create a task first, then attach a reminder as a distinct step,
   * and need a real rejected Promise to detect that specific failure
   * precisely (the shared remindersError string above isn't reliable for
   * that: a later item's success can overwrite an earlier item's failure
   * before the caller ever reads it).
   */
  const attachTaskReminder = useCallback(
    async (taskId: string, reminder: ReminderSelection) => {
      if (!userId) throw new Error('Not signed in.');
      const saved = await remindersApi.upsertReminderForTask(userId, taskId, reminder);
      setReminders((prev) => [...prev.filter((r) => r.taskId !== taskId), saved]);
      return saved;
    },
    [userId],
  );

  /** Attaches a reminder to an already-created event. See attachTaskReminder. */
  const attachEventReminder = useCallback(
    async (eventId: string, reminder: ReminderSelection) => {
      if (!userId) throw new Error('Not signed in.');
      const saved = await remindersApi.upsertReminderForEvent(userId, eventId, reminder);
      setReminders((prev) => [...prev.filter((r) => r.eventId !== eventId), saved]);
      return saved;
    },
    [userId],
  );

  // --- Tasks ------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  // Recurrence support (see supabase/migrations/0011_recurring_tasks_events.sql):
  // sparse sets of `${taskId}::${date}` keys — only completed/skipped
  // occurrences ever get an entry, never one row per calendar date.
  const [taskOccurrenceCompletions, setTaskOccurrenceCompletions] = useState<Set<string>>(new Set());
  const [taskOccurrenceSkips, setTaskOccurrenceSkips] = useState<Set<string>>(new Set());

  // Load tasks whenever the signed-in user changes (login/logout/switch).
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setTasksError(null);
      setTaskOccurrenceCompletions(new Set());
      setTaskOccurrenceSkips(new Set());
      return;
    }
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);
    Promise.all([
      tasksApi.fetchTasks(userId),
      tasksApi.fetchTaskOccurrenceCompletions(userId),
      tasksApi.fetchTaskOccurrenceSkips(userId),
    ])
      .then(([loadedTasks, completions, skips]) => {
        if (cancelled) return;
        setTasks(loadedTasks);
        setTaskOccurrenceCompletions(completions);
        setTaskOccurrenceSkips(skips);
      })
      .catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[AppState] fetchTasks failed', err);
        if (!cancelled) setTasksError(err.message || 'Could not load tasks.');
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addTask = useCallback(
    async (input: NewTaskInput) => {
      if (!userId) throw new Error('Not signed in.');
      setTasksError(null);
      try {
        const created = await tasksApi.createTask(userId, input);
        setTasks((prev) => [created, ...prev]);
        await applyTaskReminder(created.id, input.reminder);
        return created;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] addTask failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not create task.');
        throw err;
      }
    },
    [userId, applyTaskReminder],
  );

  const updateTask = useCallback(
    async (id: string, input: NewTaskInput) => {
      setTasksError(null);
      try {
        const updated = await tasksApi.updateTask(id, input);
        setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
        await applyTaskReminder(id, input.reminder);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] updateTask failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not update task.');
        throw err;
      }
    },
    [applyTaskReminder],
  );

  const toggleTask = useCallback(
    async (id: string) => {
      const current = tasks.find((task) => task.id === id);
      if (!current) return;

      // A still-recurring series parent has no meaningful "complete the
      // whole series" action — completion is always per-occurrence (see
      // task_occurrence_completions / src/lib/occurrences.ts). Any
      // caller that reaches toggleTask with a recurring series parent's
      // id (e.g. the Tasks page's "All" tab, which shows the series
      // parent as its own defining row with no specific date context)
      // is redirected here to TODAY's occurrence specifically —
      // mirroring how Today/Plan My Day already treat "today" as the
      // relevant occurrence for a series when no more specific date is
      // given. This function must NEVER write status onto a recurring
      // parent's own row; occurrence rows that already know their exact
      // date (Today/Tasks' Today&Upcoming filters/Calendar) call
      // setTaskOccurrenceCompletion directly with that date instead of
      // going through toggleTask at all.
      if (current.recurrenceType !== 'none') {
        if (!userId) return;
        const todayISO = toISODate(new Date());
        const key = `${id}::${todayISO}`;
        const wasCompleted = taskOccurrenceCompletions.has(key);
        const nextCompleted = !wasCompleted;

        setTaskOccurrenceCompletions((prev) => {
          const next = new Set(prev);
          if (nextCompleted) next.add(key);
          else next.delete(key);
          return next;
        });

        try {
          if (nextCompleted) {
            await tasksApi.completeTaskOccurrence(userId, id, todayISO);
          } else {
            await tasksApi.uncompleteTaskOccurrence(id, todayISO);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[AppState] toggleTask (recurring occurrence) failed', err);
          setTaskOccurrenceCompletions((prev) => {
            const next = new Set(prev);
            if (wasCompleted) next.add(key);
            else next.delete(key);
            return next;
          });
        }
        return;
      }

      const nextStatus = current.status === 'completed' ? 'todo' : 'completed';

      // Optimistic update so checkboxes feel instant.
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? { ...task, status: nextStatus } : task)),
      );

      try {
        const updated = await tasksApi.setTaskStatus(id, nextStatus);
        setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] toggleTask failed', err);
        // Roll back on failure.
        setTasks((prev) =>
          prev.map((task) => (task.id === id ? { ...task, status: current.status } : task)),
        );
        setTasksError(err instanceof Error ? err.message : 'Could not update task.');
      }
    },
    [tasks, userId, taskOccurrenceCompletions],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const previousTasks = tasks;
      const previousReminders = reminders;
      setTasks((prev) => prev.filter((task) => task.id !== id));
      // The DB cascades the reminder delete automatically; mirror it locally too.
      setReminders((prev) => prev.filter((reminder) => reminder.taskId !== id));
      try {
        await tasksApi.deleteTask(id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] deleteTask failed', err);
        setTasks(previousTasks);
        setReminders(previousReminders);
        setTasksError(err instanceof Error ? err.message : 'Could not delete task.');
        throw err;
      }
    },
    [tasks, reminders],
  );

  const setTaskSchedule = useCallback(
    async (id: string, schedule: { date: string; startTime: string; endTime: string } | null) => {
      try {
        const updated = await tasksApi.updateTaskSchedule(id, schedule);
        setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] setTaskSchedule failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not schedule task.');
        throw err;
      }
    },
    [],
  );

  // --- Recurrence: per-occurrence task actions ---------------------------
  // See supabase/migrations/0011_recurring_tasks_events.sql and
  // src/lib/occurrences.ts for the full architecture. None of these ever
  // touch the series' own row — they only add/remove sparse
  // completion/skip records, or (for "edit this occurrence") create an
  // entirely ordinary task that happens to reference which series/date it
  // stands in for.

  const setTaskOccurrenceCompletion = useCallback(
    async (taskId: string, occurrenceDate: string, completed: boolean) => {
      if (!userId) return;
      const key = `${taskId}::${occurrenceDate}`;
      const previous = taskOccurrenceCompletions;
      setTaskOccurrenceCompletions((prev) => {
        const next = new Set(prev);
        if (completed) next.add(key);
        else next.delete(key);
        return next;
      });
      try {
        if (completed) {
          await tasksApi.completeTaskOccurrence(userId, taskId, occurrenceDate);
        } else {
          await tasksApi.uncompleteTaskOccurrence(taskId, occurrenceDate);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] setTaskOccurrenceCompletion failed', err);
        setTaskOccurrenceCompletions(previous);
        setTasksError(err instanceof Error ? err.message : 'Could not update this occurrence.');
      }
    },
    [userId, taskOccurrenceCompletions],
  );

  /**
   * Deletes one occurrence of a recurring task. If that occurrence was
   * already overridden by its own real task row (overrideTaskId), that
   * row is deleted too — otherwise the computed occurrence would simply
   * reappear on that date. The series itself (seriesId) is never touched.
   */
  const deleteTaskOccurrence = useCallback(
    async (seriesId: string, occurrenceDate: string, overrideTaskId?: string) => {
      if (!userId) return;
      try {
        if (overrideTaskId) {
          await tasksApi.deleteTask(overrideTaskId);
          setTasks((prev) => prev.filter((task) => task.id !== overrideTaskId));
        }
        await tasksApi.skipTaskOccurrence(userId, seriesId, occurrenceDate);
        setTaskOccurrenceSkips((prev) => new Set(prev).add(`${seriesId}::${occurrenceDate}`));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] deleteTaskOccurrence failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not remove this occurrence.');
        throw err;
      }
    },
    [userId],
  );

  /** "Edit this occurrence" — creates a real, ordinary task standing in for one date of a series. */
  const saveTaskOccurrenceOverride = useCallback(
    async (seriesId: string, occurrenceDate: string, input: NewTaskInput) => {
      if (!userId) throw new Error('Not signed in.');
      try {
        const created = await tasksApi.createTaskOccurrenceOverride(userId, seriesId, occurrenceDate, input);
        setTasks((prev) => [created, ...prev]);
        await applyTaskReminder(created.id, input.reminder);
        return created;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] saveTaskOccurrenceOverride failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not update this occurrence.');
        throw err;
      }
    },
    [userId, applyTaskReminder],
  );

  // --- Calendar events ----------------------------------------------------
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventOccurrenceSkips, setEventOccurrenceSkips] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      setEventsError(null);
      setEventOccurrenceSkips(new Set());
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    Promise.all([eventsApi.fetchEvents(userId), eventsApi.fetchEventOccurrenceSkips(userId)])
      .then(([loadedEvents, skips]) => {
        if (cancelled) return;
        setEvents(loadedEvents);
        setEventOccurrenceSkips(skips);
      })
      .catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[AppState] fetchEvents failed', err);
        if (!cancelled) setEventsError(err.message || 'Could not load calendar events.');
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const addEvent = useCallback(
    async (input: NewEventInput) => {
      if (!userId) throw new Error('Not signed in.');
      setEventsError(null);
      try {
        const created = await eventsApi.createEvent(userId, input);
        setEvents((prev) => [...prev, created]);
        await applyEventReminder(created.id, input.reminder);
        return created;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] addEvent failed', err);
        setEventsError(err instanceof Error ? err.message : 'Could not create event.');
        throw err;
      }
    },
    [userId, applyEventReminder],
  );

  const updateEvent = useCallback(
    async (id: string, input: NewEventInput) => {
      setEventsError(null);
      try {
        const updated = await eventsApi.updateEvent(id, input);
        setEvents((prev) => prev.map((event) => (event.id === id ? updated : event)));
        await applyEventReminder(id, input.reminder);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] updateEvent failed', err);
        setEventsError(err instanceof Error ? err.message : 'Could not update event.');
        throw err;
      }
    },
    [applyEventReminder],
  );

  /** Deletes one occurrence of a recurring event. See deleteTaskOccurrence for the same pattern. */
  const deleteEventOccurrence = useCallback(
    async (seriesId: string, occurrenceDate: string, overrideEventId?: string) => {
      if (!userId) return;
      try {
        if (overrideEventId) {
          await eventsApi.deleteEvent(overrideEventId);
          setEvents((prev) => prev.filter((event) => event.id !== overrideEventId));
        }
        await eventsApi.skipEventOccurrence(userId, seriesId, occurrenceDate);
        setEventOccurrenceSkips((prev) => new Set(prev).add(`${seriesId}::${occurrenceDate}`));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] deleteEventOccurrence failed', err);
        setEventsError(err instanceof Error ? err.message : 'Could not remove this occurrence.');
        throw err;
      }
    },
    [userId],
  );

  /** "Edit this occurrence" for events — see saveTaskOccurrenceOverride. */
  const saveEventOccurrenceOverride = useCallback(
    async (seriesId: string, occurrenceDate: string, input: NewEventInput) => {
      if (!userId) throw new Error('Not signed in.');
      try {
        const created = await eventsApi.createEventOccurrenceOverride(userId, seriesId, occurrenceDate, input);
        setEvents((prev) => [...prev, created]);
        await applyEventReminder(created.id, input.reminder);
        return created;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] saveEventOccurrenceOverride failed', err);
        setEventsError(err instanceof Error ? err.message : 'Could not update this occurrence.');
        throw err;
      }
    },
    [userId, applyEventReminder],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const previousEvents = events;
      const previousReminders = reminders;
      setEvents((prev) => prev.filter((event) => event.id !== id));
      // The DB cascades the reminder delete automatically; mirror it locally too.
      setReminders((prev) => prev.filter((reminder) => reminder.eventId !== id));
      try {
        await eventsApi.deleteEvent(id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] deleteEvent failed', err);
        setEvents(previousEvents);
        setReminders(previousReminders);
        setEventsError(err instanceof Error ? err.message : 'Could not delete event.');
        throw err;
      }
    },
    [events, reminders],
  );

  // The next upcoming event/meeting from now, used by Today's "Up next" card.
  const upcomingEvent = useMemo(() => {
    const now = new Date();
    const nowISO = toISODate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const upcoming = events
      .filter((event) => {
        if (event.eventDate > nowISO) return true;
        if (event.eventDate < nowISO) return false;
        if (event.allDay || !event.startTime) return true;
        return toMinutes(event.startTime) >= nowMinutes;
      })
      .sort((a, b) => {
        if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
        const aOrder = a.allDay ? -1 : a.startTime ? toMinutes(a.startTime) : 24 * 60;
        const bOrder = b.allDay ? -1 : b.startTime ? toMinutes(b.startTime) : 24 * 60;
        return aOrder - bOrder;
      });

    return upcoming[0] ?? null;
  }, [events]);

  // --- Focus session ----------------------------------------------------
  // The live countdown stays entirely in React state — it is never written
  // to Supabase every second (see AppStateProvider's module doc). Only a
  // single row is saved once a session actually finishes, via
  // persistFocusSession below.
  const [focusSession, setFocusSession] = useState<FocusSessionState>({
    status: 'idle',
    durationMinutes: DEFAULT_DURATION,
    secondsLeft: DEFAULT_DURATION * 60,
    selectedTaskId: null,
    startedAt: null,
  });

  const [focusHistory, setFocusHistory] = useState<FocusSessionRecord[]>([]);
  const [focusHistoryLoading, setFocusHistoryLoading] = useState(false);
  const [focusHistoryError, setFocusHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setFocusHistory([]);
      setFocusHistoryError(null);
      return;
    }
    let cancelled = false;
    setFocusHistoryLoading(true);
    setFocusHistoryError(null);
    focusSessionsApi
      .fetchFocusSessions(userId)
      .then((loaded) => {
        if (!cancelled) setFocusHistory(loaded);
      })
      .catch((err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[AppState] fetchFocusSessions failed', err);
        if (!cancelled) setFocusHistoryError(err.message || 'Could not load focus history.');
      })
      .finally(() => {
        if (!cancelled) setFocusHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Prevents a session from being saved twice — e.g. if the natural
  // completion path and a subsequent "Done" tap both attempted to persist
  // the same session. Reset whenever a fresh session actually starts.
  const focusSaveGuardRef = useRef(false);

  const persistFocusSession = useCallback(
    async (params: {
      taskId: string | null;
      startedAt: string;
      plannedMinutes: number;
      actualSeconds: number;
      status: 'completed' | 'ended_early';
    }) => {
      if (!userId) return;
      if (focusSaveGuardRef.current) return;
      focusSaveGuardRef.current = true;
      try {
        const saved = await focusSessionsApi.saveFocusSession(userId, {
          taskId: params.taskId,
          startedAt: params.startedAt,
          endedAt: new Date().toISOString(),
          plannedMinutes: params.plannedMinutes,
          actualSeconds: params.actualSeconds,
          status: params.status,
        });
        setFocusHistory((prev) => [saved, ...prev]);
        setFocusHistoryError(null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] persistFocusSession failed', err);
        setFocusHistoryError(
          err instanceof Error ? err.message : 'Could not save your focus session.',
        );
      }
    },
    [userId],
  );

  // Today's sessions/seconds, derived from persisted history so it
  // survives a refresh (unlike a local-only counter would).
  const todayFocusSummary = useMemo<TodayFocusSummary>(() => {
    const todayISO = toISODate(new Date());
    const todays = focusHistory.filter((session) => toISODate(new Date(session.startedAt)) === todayISO);
    return {
      sessionsToday: todays.length,
      secondsToday: todays.reduce((sum, session) => sum + session.actualSeconds, 0),
    };
  }, [focusHistory]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const selectFocusTask = useCallback((id: string) => {
    setFocusSession((prev) => (prev.status === 'running' ? prev : { ...prev, selectedTaskId: id }));
  }, []);

  const selectFocusDuration = useCallback((minutes: number) => {
    setFocusSession((prev) =>
      prev.status === 'running'
        ? prev
        : { ...prev, durationMinutes: minutes, secondsLeft: minutes * 60 },
    );
  }, []);

  const completeSession = useCallback(() => {
    clearTimer();
    setFocusSession((prev) => {
      // secondsLeft only ever decrements while status === 'running', so
      // this is already exact to the second (pauses are naturally
      // excluded) — no separate elapsed-time tracking needed.
      const actualSeconds = prev.durationMinutes * 60 - prev.secondsLeft;
      if (prev.startedAt) {
        void persistFocusSession({
          taskId: prev.selectedTaskId,
          startedAt: prev.startedAt,
          plannedMinutes: prev.durationMinutes,
          actualSeconds,
          status: 'completed',
        });
      }
      return { ...prev, status: 'completed', secondsLeft: 0 };
    });
  }, [clearTimer, persistFocusSession]);

  const tick = useCallback(() => {
    setFocusSession((prev) => {
      if (prev.secondsLeft <= 0) {
        return prev; // already at zero; the completion effect takes it from here
      }
      return { ...prev, secondsLeft: prev.secondsLeft - 1 };
    });
  }, []);

  useEffect(() => {
    if (focusSession.status === 'running' && focusSession.secondsLeft === 0) {
      completeSession();
    }
  }, [focusSession.status, focusSession.secondsLeft, completeSession]);

  const startFocus = useCallback(() => {
    setFocusSession((prev) => {
      const startingFresh = prev.status !== 'paused';
      if (startingFresh) {
        // A brand-new session — clear the guard so it can be saved once
        // it finishes, and capture a real wall-clock start time.
        focusSaveGuardRef.current = false;
      }
      return {
        ...prev,
        status: 'running',
        secondsLeft: prev.status === 'paused' ? prev.secondsLeft : prev.durationMinutes * 60,
        startedAt: startingFresh ? new Date().toISOString() : prev.startedAt,
      };
    });
    clearTimer();
    intervalRef.current = setInterval(tick, 1000);
  }, [clearTimer, tick]);

  const pauseFocus = useCallback(() => {
    clearTimer();
    setFocusSession((prev) => (prev.status === 'running' ? { ...prev, status: 'paused' } : prev));
  }, [clearTimer]);

  const resumeFocus = useCallback(() => {
    setFocusSession((prev) => ({ ...prev, status: 'running' }));
    clearTimer();
    intervalRef.current = setInterval(tick, 1000);
  }, [clearTimer, tick]);

  const endFocus = useCallback(() => {
    clearTimer();
    setFocusSession((prev) => {
      // Only persist as "ended_early" if the session was actually still
      // running/paused. If status is already 'completed', it was already
      // saved by completeSession — this branch just resets state, so a
      // "Done" tap after natural completion never double-saves.
      const isEndingEarly = prev.status === 'running' || prev.status === 'paused';
      if (isEndingEarly && prev.startedAt) {
        const actualSeconds = prev.durationMinutes * 60 - prev.secondsLeft;
        if (actualSeconds > 0) {
          void persistFocusSession({
            taskId: prev.selectedTaskId,
            startedAt: prev.startedAt,
            plannedMinutes: prev.durationMinutes,
            actualSeconds,
            status: 'ended_early',
          });
        }
      }
      return {
        status: 'idle',
        durationMinutes: prev.durationMinutes,
        secondsLeft: prev.durationMinutes * 60,
        selectedTaskId: prev.selectedTaskId,
        startedAt: null,
      };
    });
  }, [clearTimer, persistFocusSession]);

  const value = useMemo<AppStateValue>(
    () => ({
      tasks,
      tasksLoading,
      tasksError,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      setTaskSchedule,
      taskOccurrenceCompletions,
      taskOccurrenceSkips,
      eventOccurrenceSkips,
      setTaskOccurrenceCompletion,
      deleteTaskOccurrence,
      saveTaskOccurrenceOverride,
      deleteEventOccurrence,
      saveEventOccurrenceOverride,
      events,
      eventsLoading,
      eventsError,
      upcomingEvent,
      addEvent,
      updateEvent,
      deleteEvent,
      reminders,
      remindersLoading,
      remindersError,
      attachTaskReminder,
      attachEventReminder,
      focusSession,
      focusHistory,
      focusHistoryLoading,
      focusHistoryError,
      todayFocusSummary,
      selectFocusTask,
      selectFocusDuration,
      startFocus,
      pauseFocus,
      resumeFocus,
      endFocus,
    }),
    [
      tasks,
      tasksLoading,
      tasksError,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      setTaskSchedule,
      taskOccurrenceCompletions,
      taskOccurrenceSkips,
      eventOccurrenceSkips,
      setTaskOccurrenceCompletion,
      deleteTaskOccurrence,
      saveTaskOccurrenceOverride,
      deleteEventOccurrence,
      saveEventOccurrenceOverride,
      events,
      eventsLoading,
      eventsError,
      upcomingEvent,
      addEvent,
      updateEvent,
      deleteEvent,
      reminders,
      remindersLoading,
      remindersError,
      attachTaskReminder,
      attachEventReminder,
      focusSession,
      focusHistory,
      focusHistoryLoading,
      focusHistoryError,
      todayFocusSummary,
      selectFocusTask,
      selectFocusDuration,
      startFocus,
      pauseFocus,
      resumeFocus,
      endFocus,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
