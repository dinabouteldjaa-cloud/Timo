import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ProgressBar from '../../components/ui/ProgressBar';
import TaskRow from '../../components/ui/TaskRow';
import TimoMascot, { type TimoMascotVariant } from '../../components/ui/TimoMascot';
import { useLocale, formatString } from '../../i18n/LocaleContext';
import { getGreetingKey, formatFriendlyDate, toISODate } from '../../lib/utils';
import { useAppState, type NewTaskInput } from '../../state/AppStateContext';
import { expandTaskOccurrences } from '../../lib/occurrences';
import { describeRecurrence } from '../../lib/recurrence';
import AddTaskSheet from '../tasks/AddTaskSheet';
import TaskDetailsSheet from '../tasks/TaskDetailsSheet';
import NotificationOnboardingCard from './NotificationOnboardingCard';
import type { Task } from '../../types/task';
import './TodayPage.css';

// Only these four variants are used on Today for now — thinking/concerned/
// resting have no clean existing state to map to here yet, per instructions.
type TodayMascotVariant = Extract<TimoMascotVariant, 'greeting' | 'happy' | 'motivating' | 'celebrating'>;

const TODAY_MASCOT_MESSAGES: Record<TodayMascotVariant, string> = {
  greeting: "Let's make today feel manageable.",
  happy: 'Nice progress. Keep it going.',
  motivating: "One task at a time. You've got this.",
  celebrating: "You did it. Today's tasks are done!",
};

/**
 * Deterministic, local-only — no AI. Operates on today's relevant task
 * entries (see todayRelevantEntries below), never the user's full task
 * history, so a task due yesterday or scheduled for next week can never
 * change what Timo says today.
 */
function getTodayMascotVariant(total: number, completed: number): TodayMascotVariant {
  if (total > 0 && completed === total) return 'celebrating';
  if (completed > 0) return 'happy';
  if (total - completed >= 3) return 'motivating';
  return 'greeting';
}

interface TodayEntry {
  /** The row to display (an override or the series parent for a recurring occurrence; the task itself otherwise). */
  task: Task;
  /** The recurring parent's id, or the task's own id if not recurring. */
  seriesId: string;
  /** Set only for a genuine recurring occurrence — used for per-occurrence completion/edit/delete. */
  occurrenceDate?: string;
  isRecurring: boolean;
  completed: boolean;
}

export default function TodayPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const {
    tasks,
    tasksLoading,
    toggleTask,
    addTask,
    updateTask,
    deleteTask,
    deleteTaskOccurrence,
    saveTaskOccurrenceOverride,
    taskOccurrenceCompletions,
    taskOccurrenceSkips,
    setTaskOccurrenceCompletion,
    eventsLoading,
    upcomingEvent,
    reminders,
    focusSession,
    todayFocusSummary,
    selectFocusTask,
    workingDays,
  } = useAppState();

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskSheetHidesRecurrence, setTaskSheetHidesRecurrence] = useState(false);
  const [taskOverrideContext, setTaskOverrideContext] = useState<{ seriesId: string; date: string } | null>(null);
  const [detailsEntry, setDetailsEntry] = useState<TodayEntry | null>(null);

  const greeting = t.today[getGreetingKey()];
  const dateLabel = useMemo(() => formatFriendlyDate(locale), [locale]);
  const todayISO = toISODate(new Date());

  const todayOccurrences = useMemo(
    () => expandTaskOccurrences(tasks, todayISO, todayISO, taskOccurrenceCompletions, taskOccurrenceSkips),
    [tasks, todayISO, taskOccurrenceCompletions, taskOccurrenceSkips],
  );

  // Today's relevant tasks — a union of:
  //   1. today's occurrences of recurring series (and non-recurring tasks
  //      whose own dueDate is today), from the shared occurrence expansion;
  //   2. dateless tasks — never tied to any day, so (as before this
  //      feature existed) they always count as part of today;
  //   3. tasks explicitly scheduled onto today via Plan My Day, even if
  //      their own dueDate is a different day.
  // Every Today-scoped number below (display list, counts, progress,
  // mascot) is derived from this SAME list, so they can never disagree.
  const todayRelevantEntries = useMemo<TodayEntry[]>(() => {
    const entries: TodayEntry[] = [];
    const seen = new Set<string>();

    for (const occ of todayOccurrences) {
      entries.push({
        task: occ.task,
        seriesId: occ.seriesId,
        occurrenceDate: occ.date,
        isRecurring: occ.isRecurring,
        completed: occ.completed,
      });
      seen.add(occ.task.id);
    }

    for (const task of tasks) {
      if (task.recurrenceParentId) continue; // only ever shown attached to its series' occurrence slot
      if (seen.has(task.id)) continue;
      const isDateless = !task.dueDate && task.recurrenceType === 'none';
      const isScheduledToday = task.scheduledDate === todayISO;
      if (isDateless || isScheduledToday) {
        entries.push({
          task,
          seriesId: task.id,
          isRecurring: false,
          completed: task.status === 'completed',
        });
        seen.add(task.id);
      }
    }

    return entries;
  }, [todayOccurrences, tasks, todayISO]);

  function entryAsTask(entry: TodayEntry): Task {
    return {
      ...entry.task,
      dueDate: entry.occurrenceDate ?? entry.task.dueDate,
      status: entry.completed ? 'completed' : 'todo',
    };
  }

  const todaysTasks = todayRelevantEntries.filter((e) => !e.completed).slice(0, 4);
  const completed = todayRelevantEntries.filter((e) => e.completed).length;
  const progressPct =
    todayRelevantEntries.length === 0 ? 0 : (completed / todayRelevantEntries.length) * 100;

  const mascotVariant = getTodayMascotVariant(todayRelevantEntries.length, completed);
  const mascotMessage = TODAY_MASCOT_MESSAGES[mascotVariant];

  const taskIdsWithReminder = new Set(
    reminders.filter((r) => r.taskId).map((r) => r.taskId as string),
  );

  const focusIsActive = focusSession.status === 'running' || focusSession.status === 'paused';
  const todayFocusMinutes = Math.round(todayFocusSummary.secondsToday / 60);
  const hasFocusHistoryToday = !focusIsActive && todayFocusSummary.sessionsToday > 0;

  const focusSubtitle = focusIsActive
    ? 'In progress — tap to resume'
    : hasFocusHistoryToday
      ? `${todayFocusMinutes} min · ${todayFocusSummary.sessionsToday} session${todayFocusSummary.sessionsToday === 1 ? '' : 's'} today`
      : 'Start a deep work session';

  function openQuickAdd() {
    setEditingTask(null);
    setTaskSheetHidesRecurrence(false);
    setTaskOverrideContext(null);
    setTaskSheetOpen(true);
  }

  function openTaskDetails(entry: TodayEntry) {
    setDetailsEntry(entry);
  }

  function closeTaskDetails() {
    setDetailsEntry(null);
  }

  /** Plain (non-recurring) edit path — unchanged from before this feature. */
  function editTaskFromDetails() {
    if (!detailsEntry) return;
    const series = tasks.find((tsk) => tsk.id === detailsEntry.seriesId) ?? detailsEntry.task;
    setEditingTask(series);
    setTaskSheetHidesRecurrence(false);
    setTaskOverrideContext(null);
    setDetailsEntry(null);
    setTaskSheetOpen(true);
  }

  function editTaskOccurrence() {
    if (!detailsEntry || !detailsEntry.occurrenceDate) return;
    setEditingTask({ ...detailsEntry.task, dueDate: detailsEntry.occurrenceDate });
    setTaskSheetHidesRecurrence(true);
    setTaskOverrideContext({ seriesId: detailsEntry.seriesId, date: detailsEntry.occurrenceDate });
    setDetailsEntry(null);
    setTaskSheetOpen(true);
  }

  async function deleteTaskSeries() {
    if (!detailsEntry) return;
    await deleteTask(detailsEntry.seriesId);
    setDetailsEntry(null);
  }

  async function deleteTaskOccurrenceChoice() {
    if (!detailsEntry || !detailsEntry.occurrenceDate) return;
    const overrideId = detailsEntry.task.recurrenceParentId ? detailsEntry.task.id : undefined;
    await deleteTaskOccurrence(detailsEntry.seriesId, detailsEntry.occurrenceDate, overrideId);
    setDetailsEntry(null);
  }

  function startFocusFromDetails() {
    if (!detailsEntry) return;
    selectFocusTask(detailsEntry.task.id);
    setDetailsEntry(null);
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
    } else {
      await addTask(input);
    }
    closeTaskSheet();
  }

  function handleToggle(entry: TodayEntry) {
    if (entry.occurrenceDate && entry.isRecurring) {
      void setTaskOccurrenceCompletion(entry.seriesId, entry.occurrenceDate, !entry.completed);
    } else {
      toggleTask(entry.task.id);
    }
  }

  return (
    <>
      <Header title={greeting} subtitle={dateLabel} />

      <div className="today-page">
        {/* Shows only on a device's first eligible session — see
            NotificationOnboardingCard for the exact eligibility checks.
            Renders nothing once dismissed/enabled/denied/unsupported. */}
        <NotificationOnboardingCard />

        {/* Timo mascot card — real artwork, mascot on left, text on right. */}
        <Card className="today-mascot" padding="sm">
          <div className="today-mascot__image">
            <TimoMascot variant={mascotVariant} />
          </div>
          <div className="today-mascot__text">
            <p className="today-mascot__name">Timo</p>
            <p className="today-mascot__message">{mascotMessage}</p>
          </div>
        </Card>

        {/* Daily progress */}
        <Card padding="sm">
          <div className="today-summary__row">
            <span className="today-summary__label">
              {formatString(t.today.tasksCompleted, { completed, total: todayRelevantEntries.length })}
            </span>
            <span className="today-summary__pct">{Math.round(progressPct)}%</span>
          </div>
          <ProgressBar value={progressPct} tone="success" />
        </Card>

        {/* Plan my day — proposes a schedule for review, never saves automatically */}
        <Button fullWidth size="lg" variant="primary" onClick={() => navigate('/plan-my-day')}>
          ✨ {t.today.planMyDay}
        </Button>

        {/* Quick actions: Brain Dump + Focus, as a compact balanced pair */}
        <div className="today-quick-actions">
          <button className="today-quick-action" onClick={() => navigate('/brain-dump')}>
            <span className="today-quick-action__icon">🧠</span>
            <span className="today-quick-action__title">Brain Dump</span>
            <span className="today-quick-action__subtitle">Capture what's on your mind</span>
          </button>
          <button className="today-quick-action" onClick={() => navigate('/focus')}>
            <span className="today-quick-action__icon">🎯</span>
            <span className="today-quick-action__title">{focusIsActive ? 'Resume Focus' : 'Start Focus'}</span>
            <span className="today-quick-action__subtitle">{focusSubtitle}</span>
          </button>
        </div>

        {/* Up next */}
        <div>
          <p className="today-section-label">{t.today.upNext}</p>
          {eventsLoading ? (
            <p className="today-upnext-compact">Loading…</p>
          ) : upcomingEvent ? (
            <Card padding="sm">
              <div className="today-upnext">
                <div className="today-upnext__time">
                  <span>{upcomingEvent.allDay ? 'All day' : upcomingEvent.startTime ?? ''}</span>
                </div>
                <div className="today-upnext__divider" />
                <div className="today-upnext__body">
                  <p className="today-upnext__title">{upcomingEvent.title}</p>
                  {upcomingEvent.location && (
                    <p className="today-upnext__location">{upcomingEvent.location}</p>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <p className="today-upnext-compact">Nothing coming up on your calendar.</p>
          )}
        </div>

        {/* Today's tasks */}
        <div>
          <div className="today-section-header">
            <p className="today-section-label">{t.today.todaysTasks}</p>
            <button className="today-section-link" onClick={() => navigate('/tasks')}>
              {t.today.seeAll}
            </button>
          </div>
          <Card padding="md">
            {tasksLoading ? (
              <p className="today-empty">Loading your tasks…</p>
            ) : todaysTasks.length === 0 ? (
              <p className="today-empty">{t.today.noTasksToday}</p>
            ) : (
              todaysTasks.map((entry) => (
                <TaskRow
                  key={entry.occurrenceDate ? `${entry.seriesId}::${entry.occurrenceDate}` : entry.task.id}
                  task={entryAsTask(entry)}
                  onToggle={() => handleToggle(entry)}
                  onOpen={() => openTaskDetails(entry)}
                  hasReminder={taskIdsWithReminder.has(entry.task.id)}
                />
              ))
            )}
          </Card>
        </div>

        {/* Quick add */}
        <button className="today-quick-add" onClick={openQuickAdd}>
          <span className="today-quick-add__icon">+</span>
          {t.today.quickAdd}
        </button>
      </div>

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
        open={Boolean(detailsEntry)}
        task={detailsEntry ? entryAsTask(detailsEntry) : null}
        reminder={detailsEntry ? reminders.find((r) => r.taskId === detailsEntry.task.id) ?? null : null}
        recurrenceLabel={
          detailsEntry?.isRecurring
            ? describeRecurrence(
                {
                  type: (tasks.find((tsk) => tsk.id === detailsEntry.seriesId) ?? detailsEntry.task).recurrenceType,
                  daysOfWeek: (tasks.find((tsk) => tsk.id === detailsEntry.seriesId) ?? detailsEntry.task)
                    .recurrenceDaysOfWeek,
                },
                (tasks.find((tsk) => tsk.id === detailsEntry.seriesId) ?? detailsEntry.task).dueDate ??
                  detailsEntry.occurrenceDate ??
                  todayISO,
                workingDays,
              )
            : null
        }
        isRecurringOccurrence={detailsEntry?.isRecurring}
        onClose={closeTaskDetails}
        onEdit={editTaskFromDetails}
        onEditOccurrence={editTaskOccurrence}
        onEditSeries={editTaskFromDetails}
        onDeleteOccurrence={deleteTaskOccurrenceChoice}
        onDeleteSeries={deleteTaskSeries}
        onStartFocus={startFocusFromDetails}
        onDelete={async () => {
          if (!detailsEntry) return;
          await deleteTask(detailsEntry.seriesId);
          closeTaskDetails();
        }}
      />
    </>
  );
}
