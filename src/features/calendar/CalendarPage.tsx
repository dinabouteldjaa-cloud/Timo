import { useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import IconButton from '../../components/ui/IconButton';
import { useLocale } from '../../i18n/LocaleContext';
import { mockEvents, APP_TODAY_ISO } from '../../data/mockData';
import { addDays, getWeekDates, parseISODate } from '../../lib/utils';
import './CalendarPage.css';

type View = 'month' | 'week' | 'day';

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

function isoForDay(reference: Date, day: number) {
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const { t } = useLocale();
  const [view, setView] = useState<View>('month');
  const [selectedDate, setSelectedDate] = useState(APP_TODAY_ISO);

  const referenceMonth = parseISODate(selectedDate);
  const cells = buildMonthGrid(referenceMonth);
  const eventDates = new Set(mockEvents.map((e) => e.date));
  const eventsForSelected = mockEvents.filter((e) => e.date === selectedDate);
  const weekDates = getWeekDates(selectedDate);

  const agendaLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(parseISODate(selectedDate));

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
              {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(referenceMonth)}
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
                const iso = day ? isoForDay(referenceMonth, day) : null;
                const isToday = iso === APP_TODAY_ISO;
                const isSelected = iso === selectedDate;
                const hasEvent = iso && eventDates.has(iso);
                return (
                  <button
                    key={i}
                    className={`calendar-cell ${isToday ? 'calendar-cell--today' : ''} ${
                      isSelected && !isToday ? 'calendar-cell--selected' : ''
                    } ${!day ? 'calendar-cell--empty' : ''}`}
                    onClick={() => iso && setSelectedDate(iso)}
                    disabled={!day}
                  >
                    {day && <span>{day}</span>}
                    {hasEvent && <span className="calendar-cell__dot" />}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {view === 'week' && (
          <Card padding="md">
            <div className="calendar-week-strip">
              {weekDates.map((iso) => {
                const date = parseISODate(iso);
                const isToday = iso === APP_TODAY_ISO;
                const isSelected = iso === selectedDate;
                const hasEvent = eventDates.has(iso);
                return (
                  <button
                    key={iso}
                    className={`calendar-week-day ${isSelected ? 'calendar-week-day--selected' : ''} ${
                      isToday ? 'calendar-week-day--today' : ''
                    }`}
                    onClick={() => setSelectedDate(iso)}
                  >
                    <span className="calendar-week-day__label">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}
                    </span>
                    <span className="calendar-week-day__num">{date.getDate()}</span>
                    {hasEvent && <span className="calendar-cell__dot" />}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {view === 'day' && (
          <Card padding="md">
            <div className="calendar-day-nav">
              <IconButton
                size="sm"
                aria-label="Previous day"
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
              <p className="calendar-day-nav__label">{agendaLabel}</p>
              <IconButton
                size="sm"
                aria-label="Next day"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
            </div>
          </Card>
        )}

        <div>
          <p className="calendar-section-label">{agendaLabel}</p>
          <Card padding="md">
            {eventsForSelected.length === 0 ? (
              <EmptyState title={t.calendar.noEvents} subtitle={t.calendar.noEventsSubtitle} />
            ) : (
              eventsForSelected.map((event) => (
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
