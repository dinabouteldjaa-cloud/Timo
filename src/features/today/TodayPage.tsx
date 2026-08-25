import { useMemo, useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ProgressBar from '../../components/ui/ProgressBar';
import TaskRow from '../../components/ui/TaskRow';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import { useLocale, formatString } from '../../i18n/LocaleContext';
import { getGreetingKey, formatFriendlyDate } from '../../lib/utils';
import { mockTasks, mockEvents, focusSuggestion } from '../../data/mockData';
import './TodayPage.css';

export default function TodayPage() {
  const { t, locale } = useLocale();
  const [tasks, setTasks] = useState(mockTasks);

  const greeting = t.today[getGreetingKey()];
  const dateLabel = useMemo(() => formatFriendlyDate(locale), [locale]);
  const upNext = mockEvents[0];

  const todaysTasks = tasks.filter((task) => task.status !== 'completed').slice(0, 4);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const progressPct = (completed / tasks.length) * 100;

  function toggleTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: task.status === 'completed' ? 'todo' : 'completed' }
          : task,
      ),
    );
  }

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

        {/* Plan my day */}
        <Button fullWidth size="lg" variant="primary">
          ✨ {t.today.planMyDay}
        </Button>

        {/* Up next */}
        {upNext && (
          <Card padding="md">
            <p className="today-section-label">{t.today.upNext}</p>
            <div className="today-upnext">
              <div className="today-upnext__time">
                <span>{upNext.startTime}</span>
              </div>
              <div className="today-upnext__divider" />
              <div className="today-upnext__body">
                <p className="today-upnext__title">{upNext.title}</p>
                {upNext.location && <p className="today-upnext__location">{upNext.location}</p>}
              </div>
            </div>
          </Card>
        )}

        {/* Focus suggestion */}
        <Card padding="md" className="today-focus-card">
          <div className="today-focus-card__row">
            <div>
              <p className="today-section-label">
                {formatString(t.today.focusAvailable, {
                  minutes: focusSuggestion.availableMinutes,
                  reason: focusSuggestion.reason,
                })}
              </p>
            </div>
            <Button variant="secondary" size="sm">
              {t.today.startFocus}
            </Button>
          </div>
        </Card>

        {/* Today's tasks */}
        <div>
          <div className="today-section-header">
            <p className="today-section-label">{t.today.todaysTasks}</p>
            <button className="today-section-link">{t.today.seeAll}</button>
          </div>
          <Card padding="md">
            {todaysTasks.length === 0 ? (
              <p className="today-empty">{t.today.noTasksToday}</p>
            ) : (
              todaysTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={toggleTask} />
              ))
            )}
          </Card>
        </div>

        {/* Quick add */}
        <button className="today-quick-add">
          <span className="today-quick-add__icon">+</span>
          {t.today.quickAdd}
        </button>
      </div>
    </>
  );
}
