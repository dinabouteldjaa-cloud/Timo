import { HashRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import TodayPage from './features/today/TodayPage';
import TasksPage from './features/tasks/TasksPage';
import CalendarPage from './features/calendar/CalendarPage';
import FocusPage from './features/focus/FocusPage';
import { LocaleProvider } from './i18n/LocaleContext';

export default function App() {
  return (
    <LocaleProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/focus" element={<FocusPage />} />
          </Routes>
        </AppShell>
      </HashRouter>
    </LocaleProvider>
  );
}
