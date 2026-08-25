// ---------------------------------------------------------------------------
// MOCK / DEMO DATA
// ---------------------------------------------------------------------------
// Tasks and calendar events are now fully backed by Supabase (see
// src/lib/tasksApi.ts and src/lib/calendarEventsApi.ts). The only remaining
// mock content is the static focus suggestion copy shown on Today, since
// focus session persistence is a later phase.
// ---------------------------------------------------------------------------

export const focusSuggestion = {
  availableMinutes: 45,
  reason: 'before your next meeting',
};
