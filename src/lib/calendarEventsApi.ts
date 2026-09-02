import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { CalendarEvent, CalendarEventType, RecurrenceType } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `calendar_events` row shape (snake_case, matches
// supabase/migrations/0002_calendar_events.sql plus recurrence columns from
// 0011_recurring_tasks_events.sql) and mapping to/from the app's
// `CalendarEvent` type so the rest of the app never has to deal with the
// DB's column naming.
// ---------------------------------------------------------------------------

interface CalendarEventRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  event_type: CalendarEventType;
  recurrence_type: RecurrenceType;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_parent_id: string | null;
  recurrence_occurrence_date: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    eventDate: row.event_date,
    // Postgres `time` comes back as "HH:MM:SS" — trim to "HH:MM" for <input type="time">.
    startTime: row.start_time ? row.start_time.slice(0, 5) : undefined,
    endTime: row.end_time ? row.end_time.slice(0, 5) : undefined,
    allDay: row.all_day,
    location: row.location ?? undefined,
    eventType: row.event_type,
    recurrenceType: row.recurrence_type ?? 'none',
    recurrenceDaysOfWeek: row.recurrence_days_of_week ?? undefined,
    recurrenceEndDate: row.recurrence_end_date ?? undefined,
    recurrenceParentId: row.recurrence_parent_id ?? undefined,
    recurrenceOccurrenceDate: row.recurrence_occurrence_date ?? undefined,
  };
}

export interface EventInput {
  title: string;
  description?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  eventType: CalendarEventType;
  recurrenceType?: RecurrenceType;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
}

export async function fetchEvents(userId: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('event_date', { ascending: true });

  if (error) throw toSupabaseError('Could not load calendar events', error);
  return (data as CalendarEventRow[]).map(rowToEvent);
}

export async function createEvent(userId: string, input: EventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      event_date: input.eventDate,
      start_time: input.allDay ? null : input.startTime || null,
      end_time: input.allDay ? null : input.endTime || null,
      all_day: input.allDay,
      location: input.location?.trim() || null,
      event_type: input.eventType,
      recurrence_type: input.recurrenceType ?? 'none',
      recurrence_days_of_week: input.recurrenceDaysOfWeek ?? null,
      recurrence_end_date: input.recurrenceEndDate || null,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not create event', error);
  return rowToEvent(data as CalendarEventRow);
}

export async function updateEvent(eventId: string, input: EventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      event_date: input.eventDate,
      start_time: input.allDay ? null : input.startTime || null,
      end_time: input.allDay ? null : input.endTime || null,
      all_day: input.allDay,
      location: input.location?.trim() || null,
      event_type: input.eventType,
      recurrence_type: input.recurrenceType ?? 'none',
      recurrence_days_of_week: input.recurrenceDaysOfWeek ?? null,
      recurrence_end_date: input.recurrenceEndDate || null,
    })
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not update event', error);
  return rowToEvent(data as CalendarEventRow);
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId);
  if (error) throw toSupabaseError('Could not delete event', error);
}

// ---------------------------------------------------------------------------
// Recurrence support (see supabase/migrations/0011_recurring_tasks_events.sql)
// ---------------------------------------------------------------------------

/**
 * Creates a real, ordinary event row that overrides ONE occurrence of a
 * recurring series. If an override already exists for this exact
 * (series, date) pair, it's UPDATED in place instead of inserting a
 * second one — see createTaskOccurrenceOverride in tasksApi.ts for the
 * same pattern and reasoning.
 */
export async function createEventOccurrenceOverride(
  userId: string,
  seriesId: string,
  occurrenceDate: string,
  input: EventInput,
): Promise<CalendarEvent> {
  const { data: existing, error: findError } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('recurrence_parent_id', seriesId)
    .eq('recurrence_occurrence_date', occurrenceDate)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not update this occurrence', findError);

  const fields = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    event_date: input.eventDate,
    start_time: input.allDay ? null : input.startTime || null,
    end_time: input.allDay ? null : input.endTime || null,
    all_day: input.allDay,
    location: input.location?.trim() || null,
    event_type: input.eventType,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('calendar_events')
      .update(fields)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw toSupabaseError('Could not update this occurrence', error);
    return rowToEvent(data as CalendarEventRow);
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      ...fields,
      recurrence_type: 'none',
      recurrence_parent_id: seriesId,
      recurrence_occurrence_date: occurrenceDate,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not update this occurrence', error);
  return rowToEvent(data as CalendarEventRow);
}

/**
 * Records "This occurrence" deleted, without touching the series or
 * other occurrences. See skipTaskOccurrence in tasksApi.ts for why this
 * uses select-then-insert instead of upsert(onConflict) — the same
 * partial-unique-index limitation applies here identically.
 */
export async function skipEventOccurrence(
  userId: string,
  eventId: string,
  occurrenceDate: string,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('occurrence_skips')
    .select('id')
    .eq('event_id', eventId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not remove this occurrence', findError);
  if (existing) return;

  const { error: insertError } = await supabase
    .from('occurrence_skips')
    .insert({ user_id: userId, event_id: eventId, occurrence_date: occurrenceDate });

  if (insertError) {
    if (insertError.code === '23505') return;
    throw toSupabaseError('Could not remove this occurrence', insertError);
  }
}

/** All skipped event occurrences, as `${eventId}::${date}` keys. */
export async function fetchEventOccurrenceSkips(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('occurrence_skips')
    .select('event_id, occurrence_date')
    .eq('user_id', userId)
    .not('event_id', 'is', null);

  if (error) throw toSupabaseError('Could not load skipped occurrences', error);
  return new Set((data as { event_id: string; occurrence_date: string }[]).map((r) => `${r.event_id}::${r.occurrence_date}`));
}
