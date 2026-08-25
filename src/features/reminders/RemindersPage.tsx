import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import IconButton from '../../components/ui/IconButton';
import { useAppState } from '../../state/AppStateContext';
import { toISODate } from '../../lib/utils';
import type { Reminder } from '../../types/task';
import ReminderRow from './ReminderRow';
import AddReminderSheet from './AddReminderSheet';
import ReminderDetailsSheet from './ReminderDetailsSheet';
import './RemindersPage.css';

const TODAY_ISO = toISODate(new Date());

export default function RemindersPage() {
  const navigate = useNavigate();
  const {
    reminders,
    remindersLoading,
    remindersError,
    tasks,
    events,
    addReminder,
    updateReminder,
    toggleReminder,
    deleteReminder,
  } = useAppState();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [detailsReminder, setDetailsReminder] = useState<Reminder | null>(null);

  const active = reminders.filter((r) => !r.completed);
  const completed = reminders.filter((r) => r.completed);

  const todayReminders = active.filter((r) => toISODate(new Date(r.remindAt)) === TODAY_ISO);
  const upcomingReminders = active.filter((r) => toISODate(new Date(r.remindAt)) > TODAY_ISO);
  const pastReminders = active.filter((r) => toISODate(new Date(r.remindAt)) < TODAY_ISO);

  function openAdd() {
    setEditingReminder(null);
    setSheetOpen(true);
  }

  function openDetails(reminder: Reminder) {
    setDetailsReminder(reminder);
  }

  function closeDetails() {
    setDetailsReminder(null);
  }

  function editFromDetails() {
    if (!detailsReminder) return;
    setEditingReminder(detailsReminder);
    setDetailsReminder(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingReminder(null);
  }

  function renderGroup(title: string, items: Reminder[]) {
    if (items.length === 0) return null;
    return (
      <div key={title}>
        <p className="reminders-section-label">{title}</p>
        <Card padding="md">
          {items.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              tasks={tasks}
              events={events}
              onToggle={toggleReminder}
              onOpen={openDetails}
            />
          ))}
        </Card>
      </div>
    );
  }

  return (
    <>
      <Header title="Reminders" onProfileClick={() => navigate(-1)} />

      <div className="reminders-page">
        {remindersError && <p className="reminders-error-banner">{remindersError}</p>}

        {remindersLoading ? (
          <Card padding="md">
            <p className="reminders-loading">Loading your reminders…</p>
          </Card>
        ) : reminders.length === 0 ? (
          <Card padding="md">
            <EmptyState
              title="No reminders yet"
              subtitle="Add a reminder and it will show up here."
            />
          </Card>
        ) : (
          <>
            {renderGroup('Today', todayReminders)}
            {renderGroup('Upcoming', upcomingReminders)}
            {renderGroup('Past', pastReminders)}
            {renderGroup('Completed', completed)}
          </>
        )}
      </div>

      <IconButton aria-label="Add reminder" className="reminders-fab" onClick={openAdd}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </IconButton>

      <AddReminderSheet
        open={sheetOpen}
        reminder={editingReminder}
        tasks={tasks}
        events={events}
        onClose={closeSheet}
        onSave={async (input) => {
          if (editingReminder) {
            await updateReminder(editingReminder.id, input);
          } else {
            await addReminder(input);
          }
          closeSheet();
        }}
      />

      <ReminderDetailsSheet
        open={Boolean(detailsReminder)}
        reminder={detailsReminder}
        tasks={tasks}
        events={events}
        onClose={closeDetails}
        onEdit={editFromDetails}
        onDelete={async () => {
          if (!detailsReminder) return;
          await deleteReminder(detailsReminder.id);
          closeDetails();
        }}
      />
    </>
  );
}
