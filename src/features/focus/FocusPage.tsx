import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import { formatLocalShortDate, formatLocalTime } from '../../lib/utils';
import './FocusPage.css';

const durations = [15, 25, 45, 60];
const RECENT_SESSIONS_SHOWN = 5;

/** Rounds only at display time — seconds are summed/stored precisely. */
function formatSessionDuration(actualSeconds: number): string {
  if (actualSeconds < 60) return `${actualSeconds} sec`;
  const minutes = Math.round(actualSeconds / 60);
  return `${minutes} min`;
}

export default function FocusPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const {
    tasks,
    focusSession,
    focusHistory,
    focusHistoryError,
    todayFocusSummary,
    selectFocusTask,
    selectFocusDuration,
    startFocus,
    pauseFocus,
    resumeFocus,
    endFocus,
  } = useAppState();

  const selectedTask = tasks.find((task) => task.id === focusSession.selectedTaskId);
  const totalSeconds = focusSession.durationMinutes * 60;
  const progress = totalSeconds === 0 ? 0 : 1 - focusSession.secondsLeft / totalSeconds;

  const minutes = Math.floor(focusSession.secondsLeft / 60);
  const seconds = focusSession.secondsLeft % 60;
  const timeLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isRunning = focusSession.status === 'running';
  const isPaused = focusSession.status === 'paused';
  const isCompleted = focusSession.status === 'completed';
  const isActive = isRunning || isPaused;

  const recentSessions = focusHistory.slice(0, RECENT_SESSIONS_SHOWN);
  const todayMinutesRounded = Math.round(todayFocusSummary.secondsToday / 60);

  // A running/paused session is preserved in shared app state, so leaving
  // via the back button (or any other navigation) doesn't destroy it — the
  // countdown keeps ticking and picks up right where it left off if the
  // user returns to /focus.
  function handleBack() {
    navigate('/');
  }

  function handleEnd() {
    endFocus();
    navigate('/');
  }

  function handleDone() {
    endFocus();
    navigate('/');
  }

  return (
    <>
      <Header title={t.focus.title} onBack={handleBack} />

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
              <span className="focus-ring__time">
                {isCompleted ? '🎉' : timeLabel}
              </span>
              <span className="focus-ring__sub">
                {isCompleted ? 'Session complete' : t.focus.duration}
              </span>
            </div>
          </div>

          <div className="focus-duration-row">
            {durations.map((d) => (
              <button
                key={d}
                className={`focus-duration-chip ${focusSession.durationMinutes === d ? 'focus-duration-chip--active' : ''}`}
                onClick={() => selectFocusDuration(d)}
                disabled={isActive}
              >
                {d}
              </button>
            ))}
          </div>

          {!isActive && !isCompleted && (
            <Button fullWidth size="lg" onClick={startFocus}>
              {t.focus.start}
            </Button>
          )}

          {isRunning && (
            <div className="focus-controls-row">
              <Button variant="secondary" fullWidth onClick={pauseFocus}>
                {t.focus.pause}
              </Button>
              <Button variant="danger" fullWidth onClick={handleEnd}>
                End session
              </Button>
            </div>
          )}

          {isPaused && (
            <div className="focus-controls-row">
              <Button fullWidth onClick={resumeFocus}>
                {t.focus.resume}
              </Button>
              <Button variant="danger" fullWidth onClick={handleEnd}>
                End session
              </Button>
            </div>
          )}

          {isCompleted && (
            <Button fullWidth size="lg" onClick={handleDone}>
              Done — back to Today
            </Button>
          )}
        </Card>

        {focusHistoryError && <p className="focus-error-banner">{focusHistoryError}</p>}

        <div>
          <p className="focus-section-label">{t.focus.selectTask}</p>
          <Card padding="none">
            {tasks
              .filter((task) => task.status !== 'completed')
              .map((task) => (
                <button
                  key={task.id}
                  className={`focus-task-option ${focusSession.selectedTaskId === task.id ? 'focus-task-option--active' : ''}`}
                  onClick={() => selectFocusTask(task.id)}
                  disabled={isActive}
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
              <span className="focus-stat__value">{todayFocusSummary.sessionsToday}</span>
              <span className="focus-stat__label">{t.focus.sessionsCompleted}</span>
            </div>
            <div className="focus-stat">
              <span className="focus-stat__value">{todayMinutesRounded}</span>
              <span className="focus-stat__label">{t.focus.minutesFocused}</span>
            </div>
          </div>
        </Card>

        {recentSessions.length > 0 && (
          <div>
            <p className="focus-section-label">Recent sessions</p>
            <Card padding="none">
              {recentSessions.map((session) => {
                const linkedTask = session.taskId
                  ? tasks.find((task) => task.id === session.taskId)
                  : undefined;
                return (
                  <div key={session.id} className="focus-history-row">
                    <div className="focus-history-row__body">
                      <p className="focus-history-row__title">
                        {linkedTask ? linkedTask.title : 'Focus session'}
                      </p>
                      <p className="focus-history-row__meta">
                        {formatLocalShortDate(session.startedAt)} ·{' '}
                        {formatLocalTime(session.startedAt)} ·{' '}
                        {formatSessionDuration(session.actualSeconds)}
                      </p>
                    </div>
                    <Badge tone={session.status === 'completed' ? 'success' : 'neutral'}>
                      {session.status === 'completed' ? 'Completed' : 'Ended early'}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
