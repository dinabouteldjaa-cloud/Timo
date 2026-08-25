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
import type { Task, TaskCategory, TaskPriority } from '../types/task';
import { focusSuggestion } from '../data/mockData';
import { useAuth } from './AuthContext';
import * as tasksApi from '../lib/tasksApi';

// ---------------------------------------------------------------------------
// Shared app state.
//
// Tasks are now backed by Supabase (see src/lib/tasksApi.ts) and scoped to
// the signed-in user via RLS. The focus session/timer below is still purely
// local/in-memory — focus session persistence is a later phase.
// ---------------------------------------------------------------------------

export interface NewTaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority: TaskPriority;
  category: TaskCategory;
  estimatedMinutes?: number;
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

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppState] addTask failed', err);
        setTasksError(err instanceof Error ? err.message : 'Could not create task.');
        throw err;
      }
    },
    [userId],
  );

  const updateTask = useCallback(async (id: string, input: NewTaskInput) => {
    setTasksError(null);
    try {
      const updated = await tasksApi.updateTask(id, input);
      setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AppState] updateTask failed', err);
      setTasksError(err instanceof Error ? err.message : 'Could not update task.');
      throw err;
    }
  }, []);

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

  const deleteTask = useCallback(async (id: string) => {
    const previous = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      await tasksApi.deleteTask(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AppState] deleteTask failed', err);
      setTasks(previous);
      setTasksError(err instanceof Error ? err.message : 'Could not delete task.');
      throw err;
    }
  }, [tasks]);

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
