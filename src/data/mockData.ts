// ---------------------------------------------------------------------------
// MOCK / DEMO DATA
// ---------------------------------------------------------------------------
// This file is the single source of demo content used while Supabase is not
// yet connected. Nothing here is persisted — it exists purely to make the
// UI feel real during the UI-foundation stage of the project.
//
// When the database stage begins, these exports should be replaced by real
// data-fetching hooks (e.g. useTasks(), useEvents()) backed by Supabase.
// ---------------------------------------------------------------------------

import type { CalendarEvent, Task } from '../types/task';

/**
 * Fixed reference "today" used throughout the mock data and calendar so the
 * demo content (dates, filters, agenda) stays internally consistent without
 * depending on the real device clock. Replace with a real date source once
 * live data is connected.
 */
export const APP_TODAY_ISO = '2026-08-24';

export const mockTasks: Task[] = [
  {
    id: 't1',
    title: 'Send proposal to Ahmed',
    status: 'todo',
    priority: 'high',
    category: 'work',
    dueDate: APP_TODAY_ISO,
    dueTime: '09:30',
    estimatedMinutes: 20,
  },
  {
    id: 't2',
    title: 'Finish Q3 presentation',
    status: 'in_progress',
    priority: 'high',
    category: 'work',
    dueDate: APP_TODAY_ISO,
    dueTime: '14:00',
    estimatedMinutes: 90,
  },
  {
    id: 't3',
    title: 'Buy groceries',
    status: 'todo',
    priority: 'low',
    category: 'errands',
    dueDate: APP_TODAY_ISO,
    dueTime: '18:30',
    estimatedMinutes: 30,
  },
  {
    id: 't4',
    title: 'Book dentist appointment',
    status: 'todo',
    priority: 'medium',
    category: 'health',
    dueDate: '2026-08-27',
    estimatedMinutes: 10,
  },
  {
    id: 't5',
    title: 'Read chapter 4 of design book',
    status: 'completed',
    priority: 'low',
    category: 'learning',
    estimatedMinutes: 25,
  },
  {
    id: 't6',
    title: 'Reply to Sara about the invoice',
    status: 'completed',
    priority: 'medium',
    category: 'work',
    estimatedMinutes: 10,
  },
  {
    id: 't7',
    title: 'Plan weekend trip',
    status: 'completed',
    priority: 'low',
    category: 'personal',
    estimatedMinutes: 15,
  },
];

export const mockEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Team meeting',
    date: '2026-08-24',
    startTime: '10:00',
    endTime: '10:30',
    type: 'event',
    location: 'Zoom',
  },
  {
    id: 'e2',
    title: 'Finish Q3 presentation',
    date: '2026-08-24',
    startTime: '14:00',
    endTime: '15:30',
    type: 'task',
  },
  {
    id: 'e3',
    title: '1:1 with manager',
    date: '2026-08-25',
    startTime: '11:00',
    endTime: '11:30',
    type: 'event',
  },
  {
    id: 'e4',
    title: 'Dentist appointment',
    date: '2026-08-27',
    startTime: '09:00',
    endTime: '09:45',
    type: 'event',
    location: 'Downtown Clinic',
  },
];

export const dailySummary = {
  completed: 3,
  total: 7,
};

export const focusSuggestion = {
  availableMinutes: 45,
  reason: 'before your next meeting',
};

export const todayFocusStats = {
  sessionsCompleted: 2,
  minutesFocused: 55,
};
