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
import { useAppState } from '../../state/AppStateContext';
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
 * Whether a task belongs to the user's current LOCAL day — the same
 * "is this scheduled for today" semantics TaskRow already uses
 * (scheduledDate compared via toISODate(new Date()), no UTC/timestamp
 * comparisons that could roll over at a timezone boundary).
 *
 * Priority, per the existing Plan My Day / scheduling model:
 *   1. scheduledDate, if set — an explicit Plan My Day placement always
 *      wins and decides membership outright (even if it's for another
 *      day, in which case this task is NOT part of today).
 *   2. otherwise dueDate, if set — the task's deadline.
 *   3. otherwise (no scheduledDate and no dueDate at all) — the task
 *      isn't tied to any particular day, so it isn't "future" or "past"
 *      either; it stays part of Today, matching the app's original
 *      behavior of always surfacing dateless tasks there.
 */
function isTodayRelevantTask(task: Task, todayISO: string): boolean {
  if (task.scheduledDate) return task.scheduledDate === todayISO;
  if (task.dueDate) return task.dueDate === todayISO;
  return true;
}

/**
 * Deterministic, local-only — no AI. Operates on todayRelevantTasks (see
 * isTodayRelevantTask), never the user's full task history, so a task due
 * yesterday or scheduled for next week can never change what Timo says
 * today.
 */
function getTodayMascotVariant(total: number, completed: number): TodayMascotVariant {
  if (total > 0 && completed === total) return 'celebrating';
  if (completed > 0) return 'happy';
  if (total - completed >= 3) return 'motivating';
  return 'greeting';
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
    eventsLoading,
    upcomingEvent,
    reminders,
    focusSession,
    todayFocusSummary,
    selectFocusTask,
  } = useAppState();

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);

  const greeting = t.today[getGreetingKey()];
  const dateLabel = useMemo(() => formatFriendlyDate(locale), [locale]);

  // Every Today-scoped number below (display list, counts, progress,
  // mascot) is derived from this SAME set, so they can never disagree
  // with each other, and none of them can be swayed by a task due
  // yesterday or scheduled for some other day.
  const todayISO = toISODate(new Date());
  const todayRelevantTasks = tasks.filter((task) => isTodayRelevantTask(task, todayISO));

  const todaysTasks = todayRelevantTasks.filter((task) => task.status !== 'completed').slice(0, 4);
  // Completed today-relevant tasks still count here even though the list
  // above only ever displays incomplete ones — progress/mascot need the
  // full today-relevant set, not just what's currently visible.
  const completed = todayRelevantTasks.filter((task) => task.status === 'completed').length;
  const progressPct =
    todayRelevantTasks.length === 0 ? 0 : (completed / todayRelevantTasks.length) * 100;

  const mascotVariant = getTodayMascotVariant(todayRelevantTasks.length, completed);
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
    setTaskSheetOpen(true);
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
              {formatString(t.today.tasksCompleted, { completed, total: todayRelevantTasks.length })}
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
              todaysTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={toggleTask}
                  onOpen={openTaskDetails}
                  hasReminder={taskIdsWithReminder.has(task.id)}
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
        onClose={closeTaskSheet}
        onSave={async (input) => {
          if (editingTask) {
            await updateTask(editingTask.id, input);
          } else {
            await addTask(input);
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
