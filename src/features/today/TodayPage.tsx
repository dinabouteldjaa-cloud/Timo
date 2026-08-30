import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ProgressBar from '../../components/ui/ProgressBar';
import TaskRow from '../../components/ui/TaskRow';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import { useLocale, formatString } from '../../i18n/LocaleContext';
import { getGreetingKey, formatFriendlyDate } from '../../lib/utils';
import { useAppState } from '../../state/AppStateContext';
import AddTaskSheet from '../tasks/AddTaskSheet';
import TaskDetailsSheet from '../tasks/TaskDetailsSheet';
import type { Task } from '../../types/task';
import './TodayPage.css';

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

  const todaysTasks = tasks.filter((task) => task.status !== 'completed').slice(0, 4);
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const progressPct = tasks.length === 0 ? 0 : (completed / tasks.length) * 100;

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
        {/* Timo mascot card — image slot on the left is ready for a real
            asset (e.g. src/assets/timo/timo-greeting.png) later; using the
            existing TimoAvatar placeholder for now. */}
        <Card className="today-mascot" padding="md">
          <div className="today-mascot__image">
            <TimoAvatar state="greeting" size="lg" />
          </div>
          <div className="today-mascot__text">
            <p className="today-mascot__name">Timo</p>
            <p className="today-mascot__message">{t.today.timoMessage}</p>
          </div>
        </Card>

        {/* Daily progress */}
        <Card padding="sm">
          <div className="today-summary__row">
            <span className="today-summary__label">
              {formatString(t.today.tasksCompleted, { completed, total: tasks.length })}
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
