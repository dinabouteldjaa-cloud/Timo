import { useState } from 'react';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import TaskRow from '../../components/ui/TaskRow';
import EmptyState from '../../components/ui/EmptyState';
import IconButton from '../../components/ui/IconButton';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import { APP_TODAY_ISO } from '../../data/mockData';
import AddTaskSheet from './AddTaskSheet';
import './TasksPage.css';

type Filter = 'all' | 'today' | 'upcoming' | 'completed';

export default function TasksPage() {
  const { t } = useLocale();
  const { tasks, toggleTask, addTask } = useAppState();
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.tasks.filterAll },
    { key: 'today', label: t.tasks.filterToday },
    { key: 'upcoming', label: t.tasks.filterUpcoming },
    { key: 'completed', label: t.tasks.filterCompleted },
  ];

  const filtered = tasks.filter((task) => {
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'today') return task.status !== 'completed' && task.dueDate === APP_TODAY_ISO;
    if (filter === 'upcoming') {
      return task.status !== 'completed' && (!task.dueDate || task.dueDate > APP_TODAY_ISO);
    }
    return true;
  });

  return (
    <>
      <Header title={t.tasks.title} />

      <div className="tasks-page">
        <div className="tasks-filters scroll-row">
          {filters.map((f) => (
            <button
              key={f.key}
              className={`tasks-filter ${filter === f.key ? 'tasks-filter--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Card padding="md">
          {filtered.length === 0 ? (
            <EmptyState title={t.tasks.emptyTitle} subtitle={t.tasks.emptySubtitle} />
          ) : (
            filtered.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)
          )}
        </Card>
      </div>

      <IconButton
        aria-label={t.tasks.addTask}
        className="tasks-fab"
        onClick={() => setSheetOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </IconButton>

      <AddTaskSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={(input) => {
          addTask(input);
          setSheetOpen(false);
        }}
      />
    </>
  );
}
