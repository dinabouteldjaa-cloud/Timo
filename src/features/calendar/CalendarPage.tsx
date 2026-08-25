import { useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { useLocale } from '../../i18n/LocaleContext';
import { mockEvents } from '../../data/mockData';
import './CalendarPage.css';

type View = 'month' | 'week' | 'day';

// Fixed "today" reference used for the mock calendar visuals.
const TODAY = new Date('2026-08-24T00:00:00');

function buildMonthGrid(reference: Date) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarPage() {
  const { t } = useLocale();
  const [view, setView] = useState<View>('month');

  const cells = buildMonthGrid(TODAY);
  const todayISO = TODAY.toISOString().slice(0, 10);
  const eventsToday = mockEvents.filter((e) => e.date === todayISO);
  const eventDates = new Set(mockEvents.map((e) => e.date));

  return (
    <>
      <Header title={t.calendar.title} />

      <div className="calendar-page">
        <div className="calendar-view-switch">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button
              key={v}
              className={`calendar-view-btn ${view === v ? 'calendar-view-btn--active' : ''}`}
              onClick={() => setView(v)}
            >
              {t.calendar[v]}
            </button>
          ))}
        </div>

        {view === 'month' && (
          <Card padding="md">
            <p className="calendar-month-label">
              {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(TODAY)}
            </p>
            <div className="calendar-grid calendar-grid--headers">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="calendar-grid__weekday">
                  {d}
                </span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((day, i) => {
                const iso = day
                  ? `2026-08-${String(day).padStart(2, '0')}`
                  : null;
                const isToday = day === TODAY.getDate();
                const hasEvent = iso && eventDates.has(iso);
                return (
                  <div
                    key={i}
                    className={`calendar-cell ${isToday ? 'calendar-cell--today' : ''} ${!day ? 'calendar-cell--empty' : ''}`}
                  >
                    {day && <span>{day}</span>}
                    {hasEvent && <span className="calendar-cell__dot" />}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {view !== 'month' && (
          <Card padding="lg">
            <EmptyState
              title={view === 'week' ? t.calendar.week : t.calendar.day}
              subtitle="This view is coming as the calendar architecture develops."
            />
          </Card>
        )}

        <div>
          <p className="calendar-section-label">
            {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(TODAY)}
          </p>
          <Card padding="md">
            {eventsToday.length === 0 ? (
              <EmptyState title={t.calendar.noEvents} subtitle={t.calendar.noEventsSubtitle} />
            ) : (
              eventsToday.map((event) => (
                <div key={event.id} className="calendar-event-row">
                  <div className="calendar-event-row__time">{event.startTime}</div>
                  <div className="calendar-event-row__line" />
                  <div className="calendar-event-row__body">
                    <p className="calendar-event-row__title">{event.title}</p>
                    {event.location && <p className="calendar-event-row__meta">{event.location}</p>}
                  </div>
                  <Badge tone={event.type === 'task' ? 'primary' : 'neutral'}>
                    {event.type === 'task' ? 'Task' : 'Event'}
                  </Badge>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
