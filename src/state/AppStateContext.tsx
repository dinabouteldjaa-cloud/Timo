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
import { mockTasks, focusSuggestion } from '../data/mockData';

// ---------------------------------------------------------------------------
// Shared, in-memory app state.
//
// This is intentionally a single lightweight React context rather than a
// state-management library — everything here is local-session only and is
// reset on refresh. It exists purely to keep Today / Tasks / Focus in sync
// during the UI-foundation stage, ahead of real Supabase-backed data.
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
  addTask: (input: NewTaskInput) => void;
  toggleTask: (id: string) => void;

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
  const [tasks, setTasks] = useState<Task[]>(mockTasks);

  const addTask = useCallback((input: NewTaskInput) => {
    const newTask: Task = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      status: 'todo',
      priority: input.priority,
      category: input.category,
      dueDate: input.dueDate || undefined,
      dueTime: input.dueTime || undefined,
      estimatedMinutes: input.estimatedMinutes,
    };
    setTasks((prev) => [newTask, ...prev]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: task.status === 'completed' ? 'todo' : 'completed' }
          : task,
      ),
    );
  }, []);

  // --- Focus session -------------------------------------------------
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
      addTask,
      toggleTask,
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
      addTask,
      toggleTask,
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
