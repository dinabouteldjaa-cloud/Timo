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
import './TodayPage.css';

export default function TodayPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const {
    tasks,
    tasksLoading,
    toggleTask,
    addTask,
    eventsLoading,
    upcomingEvent,
    reminders,
    focusSession,
    todayFocusSummary,
  } = useAppState();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  return (
    <>
      <Header title={greeting} subtitle={dateLabel} />

      <div className="today-page">
        {/* Timo hero */}
        <Card className="today-hero" padding="lg">
          <TimoAvatar state="greeting" size="lg" />
          <div className="today-hero__text">
            <p className="today-hero__name">Timo</p>
            <p className="today-hero__message">{t.today.timoMessage}</p>
          </div>
        </Card>

        {/* Daily summary */}
        <Card padding="md">
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

        {/* Brain Dump — AI-assisted capture, review before anything is created */}
        <button className="today-braindump-card" onClick={() => navigate('/brain-dump')}>
          <span className="today-braindump-card__icon">🧠</span>
          <span className="today-braindump-card__text">
            <span className="today-braindump-card__title">Brain Dump</span>
            <span className="today-braindump-card__subtitle">Tell Timo everything on your mind</span>
          </span>
        </button>

        {/* Up next */}
        <Card padding="md">
          <p className="today-section-label">{t.today.upNext}</p>
          {eventsLoading ? (
            <p className="today-empty">Loading…</p>
          ) : upcomingEvent ? (
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
          ) : (
            <p className="today-empty">Nothing coming up on your calendar.</p>
          )}
        </Card>

        {/* Focus suggestion */}
        <Card padding="md" className="today-focus-card">
          <div className="today-focus-card__row">
            <div>
              {hasFocusHistoryToday ? (
                <>
                  <p className="today-focus-card__title">Today's Focus</p>
                  <p className="today-focus-card__stats">
                    {todayFocusMinutes} min · {todayFocusSummary.sessionsToday} session
                    {todayFocusSummary.sessionsToday === 1 ? '' : 's'}
                  </p>
                </>
              ) : (
                <p className="today-section-label">
                  {focusIsActive ? 'Focus session in progress' : t.today.focusAvailable}
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => navigate('/focus')}>
              {focusIsActive ? 'Resume' : t.today.startFocus}
            </Button>
          </div>
        </Card>

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
                  hasReminder={taskIdsWithReminder.has(task.id)}
                />
              ))
            )}
          </Card>
        </div>

        {/* Quick add */}
        <button className="today-quick-add" onClick={() => setQuickAddOpen(true)}>
          <span className="today-quick-add__icon">+</span>
          {t.today.quickAdd}
        </button>
      </div>

      <AddTaskSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSave={async (input) => {
          await addTask(input);
          setQuickAddOpen(false);
        }}
      />
    </>
  );
}
