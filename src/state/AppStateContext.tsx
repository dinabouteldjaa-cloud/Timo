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
import type { CalendarEvent, CalendarEventType, Reminder, Task, TaskCategory, TaskPriority } from '../types/task';
import { focusSuggestion } from '../data/mockData';
import { toISODate } from '../lib/utils';
import { useAuth } from './AuthContext';
import * as tasksApi from '../lib/tasksApi';
import * as eventsApi from '../lib/calendarEventsApi';
import * as remindersApi from '../lib/remindersApi';
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
}

type FocusStatus = 'idle' | 'running' | 'paused' | 'completed';

interface FocusSessionState {
  status: FocusStatus;
  durationMinutes: number;
  secondsLeft: number;
  selectedTaskId: string | null;
}

interface FocusStatsState {
  sessionsCompleted: number;
  minutesFocused: number;
}

interface AppStateValue {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  addTask: (input: NewTaskInput) => Promise<void>;
  updateTask: (id: string, input: NewTaskInput) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  events: CalendarEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  upcomingEvent: CalendarEvent | null;
  addEvent: (input: NewEventInput) => Promise<void>;
  updateEvent: (id: string, input: NewEventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  // Read-only: reminders are only ever mutated via the task/event calls
  // above. Consumers look up `reminders.find(r => r.taskId === task.id)`
  // etc. to know whether an item has a reminder and what it is.
  reminders: Reminder[];
  remindersLoading: boolean;
  remindersError: string | null;

  focusSession: FocusSessionState;
  focusStats: FocusStatsState;
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

  // --- Tasks ------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Load tasks whenever the signed-in user changes (login/logout/switch).
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setTasksError(null);
      return;
    }
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);
    tasksApi
      .fetchTasks(userId)
      .then((loaded) => {
        if (!cancelled) setTasks(loaded);
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
      if (!userId) return;
      setTasksError(null);
      try {
        const created = await tasksApi.createTask(userId, input);
        setTasks((prev) => [created, ...prev]);
        await applyTaskReminder(created.id, input.reminder);
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
    [tasks],
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

  // --- Calendar events ----------------------------------------------------
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      setEventsError(null);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    eventsApi
      .fetchEvents(userId)
      .then((loaded) => {
        if (!cancelled) setEvents(loaded);
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
      if (!userId) return;
      setEventsError(null);
      try {
        const created = await eventsApi.createEvent(userId, input);
        setEvents((prev) => [...prev, created]);
        await applyEventReminder(created.id, input.reminder);
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

  // --- Focus session (local-only, unchanged from previous phase) ------
  const [focusSession, setFocusSession] = useState<FocusSessionState>({
    status: 'idle',
    durationMinutes: DEFAULT_DURATION,
    secondsLeft: DEFAULT_DURATION * 60,
    selectedTaskId: null,
  });

  const [focusStats, setFocusStats] = useState<FocusStatsState>({
    sessionsCompleted: 0,
    minutesFocused: 0,
  });

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
      const minutesElapsed = prev.durationMinutes - Math.floor(prev.secondsLeft / 60);
      setFocusStats((stats) => ({
        sessionsCompleted: stats.sessionsCompleted + 1,
        minutesFocused: stats.minutesFocused + Math.max(minutesElapsed, prev.durationMinutes),
      }));
      return { ...prev, status: 'completed', secondsLeft: 0 };
    });
  }, [clearTimer]);

  const tick = useCallback(() => {
    setFocusSession((prev) => {
      if (prev.secondsLeft <= 1) {
        return prev; // completion handled by effect below via completeSession
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
    setFocusSession((prev) => ({
      ...prev,
      status: 'running',
      secondsLeft: prev.status === 'paused' ? prev.secondsLeft : prev.durationMinutes * 60,
    }));
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
      const minutesElapsed = prev.durationMinutes - Math.ceil(prev.secondsLeft / 60);
      if (minutesElapsed > 0) {
        setFocusStats((stats) => ({
          sessionsCompleted: stats.sessionsCompleted + 1,
          minutesFocused: stats.minutesFocused + minutesElapsed,
        }));
      }
      return {
        status: 'idle',
        durationMinutes: prev.durationMinutes,
        secondsLeft: prev.durationMinutes * 60,
        selectedTaskId: prev.selectedTaskId,
      };
    });
  }, [clearTimer]);

  const value = useMemo<AppStateValue>(
    () => ({
      tasks,
      tasksLoading,
      tasksError,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
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
      focusSession,
      focusStats,
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
      focusSession,
      focusStats,
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

// Re-exported so screens that only need the static suggestion copy don't
// need to import mockData directly.
export { focusSuggestion };
