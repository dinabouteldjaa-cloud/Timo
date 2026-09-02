import { useMemo, useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import TaskRow from '../../components/ui/TaskRow';
import EmptyState from '../../components/ui/EmptyState';
import IconButton from '../../components/ui/IconButton';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import { expandTaskOccurrences } from '../../lib/occurrences';
import { toISODate, addDays } from '../../lib/utils';
import type { Task } from '../../types/task';
import AddTaskSheet from './AddTaskSheet';
import './TasksPage.css';

type Filter = 'all' | 'today' | 'upcoming' | 'completed';

// "Today" for filtering purposes — real device date, now that tasks are real.
const todayISO = toISODate(new Date());
// A reasonable planning horizon for expanding recurring series into the
// "Upcoming" list — showing every future occurrence forever would be
// both unbounded and overwhelming for a flat backlog-style view.
const UPCOMING_HORIZON_DAYS = 60;

export default function TasksPage() {
  const { t } = useLocale();
  const {
    tasks,
    tasksLoading,
    tasksError,
    toggleTask,
    addTask,
    updateTask,
    deleteTask,
    reminders,
    taskOccurrenceCompletions,
    taskOccurrenceSkips,
    setTaskOccurrenceCompletion,
  } = useAppState();
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.tasks.filterAll },
    { key: 'today', label: t.tasks.filterToday },
    { key: 'upcoming', label: t.tasks.filterUpcoming },
    { key: 'completed', label: t.tasks.filterCompleted },
  ];

  const horizonEnd = addDays(todayISO, UPCOMING_HORIZON_DAYS);

  // Recurring series expanded into concrete occurrences for "Today" and
  // "Upcoming" — a flat backlog view can't sensibly show every future
  // date of an unbounded series, so this is capped at a real horizon
  // (see UPCOMING_HORIZON_DAYS) rather than generating forever.
  const occurrences = useMemo(
    () => expandTaskOccurrences(tasks, todayISO, horizonEnd, taskOccurrenceCompletions, taskOccurrenceSkips),
    [tasks, horizonEnd, taskOccurrenceCompletions, taskOccurrenceSkips],
  );

  // A synthetic, TaskRow-renderable row for one occurrence — reuses the
  // series' own fields but anchors date/status to this specific occurrence,
  // so completing "today's" instance of a recurring task never touches
  // tomorrow's.
  function occurrenceAsTask(occ: (typeof occurrences)[number]): Task {
    return {
      ...occ.task,
      id: occ.task.recurrenceParentId ? occ.task.id : occ.seriesId,
      dueDate: occ.date,
      status: occ.completed ? 'completed' : 'todo',
    };
  }

  const filtered: { row: Task; editTask: Task; occurrenceDate?: string; seriesId?: string }[] = useMemo(() => {
    if (filter === 'today') {
      return occurrences
        .filter((occ) => occ.date === todayISO && !occ.completed)
        .map((occ) => ({
          row: occurrenceAsTask(occ),
          editTask: occ.task, // the real row (override or series parent) — never the synthetic display object
          occurrenceDate: occ.date,
          seriesId: occ.seriesId,
        }));
    }
    if (filter === 'upcoming') {
      return occurrences
        .filter((occ) => occ.date > todayISO && !occ.completed)
        .map((occ) => ({
          row: occurrenceAsTask(occ),
          editTask: occ.task,
          occurrenceDate: occ.date,
          seriesId: occ.seriesId,
        }));
    }
    if (filter === 'completed') {
      const nonRecurringCompleted = tasks
        .filter((task) => task.status === 'completed' && task.recurrenceType === 'none')
        .map((task) => ({ row: task, editTask: task }));
      const recurringCompleted = occurrences
        .filter((occ) => occ.completed)
        .map((occ) => ({
          row: occurrenceAsTask(occ),
          editTask: occ.task,
          occurrenceDate: occ.date,
          seriesId: occ.seriesId,
        }));
      return [...nonRecurringCompleted, ...recurringCompleted];
    }
    // "All" intentionally shows each task/series ONCE as its own defining
    // row (not expanded into every future date) — a flat list of every
    // future occurrence of every recurring series would be unbounded and
    // unreadable here. Today and Calendar are where occurrences are
    // browsed by date; this stays a list of "things you have."
    return tasks
      .filter((task) => !task.recurrenceParentId)
      .map((task) => ({ row: task, editTask: task }));
  }, [filter, tasks, occurrences]);

  function openAdd() {
    setEditingTask(null);
    setSheetOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingTask(null);
  }

  function handleToggle(row: { row: Task; occurrenceDate?: string; seriesId?: string }) {
    if (row.seriesId && row.occurrenceDate && row.row.recurrenceType !== 'none') {
      // A computed occurrence of a still-recurring series — toggle just
      // this date's completion, never the series' own row.
      void setTaskOccurrenceCompletion(row.seriesId, row.occurrenceDate, row.row.status !== 'completed');
    } else {
      toggleTask(row.row.id);
    }
  }

  return (
    <>
      <Header title={t.tasks.title} />

      <div className="tasks-page">
        <div className="tasks-filters scroll-row">
          {filters.map((f) => (
            <button
              key={f.key}
              className={`tasks-filter ${filter === f.key ? 'tasks-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {tasksError && <p className="tasks-error-banner">{tasksError}</p>}

        <Card padding="md">
          {tasksLoading ? (
            <p className="tasks-loading">Loading your tasks…</p>
          ) : filtered.length === 0 ? (
            <EmptyState title={t.tasks.emptyTitle} subtitle={t.tasks.emptySubtitle} />
          ) : (
            filtered.map((row) => (
              <TaskRow
                key={row.occurrenceDate ? `${row.seriesId}::${row.occurrenceDate}` : row.row.id}
                task={row.row}
                onToggle={() => handleToggle(row)}
                onOpen={() => openEdit(row.editTask)}
                hasReminder={reminders.some((r) => r.taskId === row.editTask.id)}
              />
            ))
          )}
        </Card>
      </div>

      <IconButton aria-label={t.tasks.addTask} className="tasks-fab" onClick={openAdd}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </IconButton>

      <AddTaskSheet
        open={sheetOpen}
        task={editingTask}
        existingReminder={
          editingTask ? reminders.find((r) => r.taskId === editingTask.id) ?? null : null
        }
        onClose={closeSheet}
        onSave={async (input) => {
          if (editingTask) {
            await updateTask(editingTask.id, input);
          } else {
            await addTask(input);
          }
          closeSheet();
        }}
        onDelete={
          editingTask
            ? async () => {
                await deleteTask(editingTask.id);
                closeSheet();
              }
            : undefined
        }
      />
    </>
  );
}
