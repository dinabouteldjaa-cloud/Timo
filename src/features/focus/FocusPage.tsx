import { useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useLocale } from '../../i18n/LocaleContext';
import { mockTasks, todayFocusStats } from '../../data/mockData';
import './FocusPage.css';

const durations = [15, 25, 45, 60];

export default function FocusPage() {
  const { t } = useLocale();
  const [duration, setDuration] = useState(25);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(mockTasks[1]?.id ?? null);

  const selectedTask = mockTasks.find((task) => task.id === selectedTaskId);
  const progress = 0; // static/demo — timer engine comes later

  return (
    <>
      <Header title={t.focus.title} />

      <div className="focus-page">
        <Card padding="lg" className="focus-timer-card">
          <div className="focus-ring">
            <svg viewBox="0 0 200 200" width="180" height="180">
              <circle cx="100" cy="100" r="88" fill="none" stroke="var(--color-surface-sunken)" strokeWidth="12" />
              <circle
                cx="100"
                cy="100"
                r="88"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 88}
                strokeDashoffset={2 * Math.PI * 88 * (1 - progress)}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="focus-ring__label">
              <span className="focus-ring__time">{String(duration).padStart(2, '0')}:00</span>
              <span className="focus-ring__sub">{t.focus.duration}</span>
            </div>
          </div>

          <div className="focus-duration-row">
            {durations.map((d) => (
              <button
                key={d}
                className={`focus-duration-chip ${duration === d ? 'focus-duration-chip--active' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d}
              </button>
            ))}
          </div>

          <Button fullWidth size="lg">
            {t.focus.start}
          </Button>
        </Card>

        <div>
          <p className="focus-section-label">{t.focus.selectTask}</p>
          <Card padding="none">
            {mockTasks
              .filter((task) => task.status !== 'completed')
              .map((task) => (
                <button
                  key={task.id}
                  className={`focus-task-option ${selectedTaskId === task.id ? 'focus-task-option--active' : ''}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="focus-task-option__radio" />
                  {task.title}
                </button>
              ))}
          </Card>
          {!selectedTask && <p className="focus-empty-note">{t.focus.noTaskSelected}</p>}
        </div>

        <Card padding="md">
          <p className="focus-section-label">{t.focus.todaysSummary}</p>
          <div className="focus-stats-row">
            <div className="focus-stat">
              <span className="focus-stat__value">{todayFocusStats.sessionsCompleted}</span>
              <span className="focus-stat__label">{t.focus.sessionsCompleted}</span>
            </div>
            <div className="focus-stat">
              <span className="focus-stat__value">{todayFocusStats.minutesFocused}</span>
              <span className="focus-stat__label">{t.focus.minutesFocused}</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
