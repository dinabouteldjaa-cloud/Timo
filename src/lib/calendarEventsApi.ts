import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { CalendarEvent, CalendarEventType } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `calendar_events` row shape (snake_case, matches
// supabase/migrations/0002_calendar_events.sql) and mapping to/from the
// app's `CalendarEvent` type so the rest of the app never has to deal with
// the DB's column naming.
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
