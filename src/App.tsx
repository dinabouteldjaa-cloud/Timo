import { HashRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RedirectIfAuthed from './components/layout/RedirectIfAuthed';
import TodayPage from './features/today/TodayPage';
import TasksPage from './features/tasks/TasksPage';
import CalendarPage from './features/calendar/CalendarPage';
import FocusPage from './features/focus/FocusPage';
import ProfilePage from './features/profile/ProfilePage';
import RemindersPage from './features/reminders/RemindersPage';
import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage';
import { LocaleProvider } from './i18n/LocaleContext';
import { AuthProvider } from './state/AuthContext';
import { AppStateProvider } from './state/AppStateContext';

export default function App() {
  return (
    <LocaleProvider>
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <LoginPage />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/signup"
              element={
                <RedirectIfAuthed>
                  <SignupPage />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <RedirectIfAuthed>
                  <ForgotPasswordPage />
                </RedirectIfAuthed>
              }
            />

            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppStateProvider>
                    <AppShell>
                      <Routes>
                        <Route path="/" element={<TodayPage />} />
                        <Route path="/tasks" element={<TasksPage />} />
                        <Route path="/calendar" element={<CalendarPage />} />
                        <Route path="/focus" element={<FocusPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/reminders" element={<RemindersPage />} />
                      </Routes>
                    </AppShell>
                  </AppStateProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </LocaleProvider>
  );
}
