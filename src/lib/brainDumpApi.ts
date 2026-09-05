import { supabase } from './supabaseClient';
import { emptyReminderValue, type ReminderPickerValue } from '../components/ui/ReminderPicker';
import { emptyRecurrenceValue, type RecurrencePickerValue } from '../components/ui/RecurrencePicker';
import { presetForOffset } from './reminderPresets';
import type { BrainDumpSuggestion } from '../types/brainDump';

// ---------------------------------------------------------------------------
// Calls the brain-dump Edge Function, which does the actual AI request
// server-side (see supabase/functions/brain-dump/index.ts). This module
// only ever returns SUGGESTIONS — creating the approved items still goes
// through the existing addTask/addEvent flow in AppStateContext, so RLS
// and normal validation apply exactly as they do everywhere else.
//
// Errors from supabase.functions.invoke() have a different shape than the
// PostgrestError the rest of the app's toSupabaseError() helper expects
// (FunctionsHttpError/FunctionsRelayError/FunctionsFetchError), so this
// module handles them locally instead of forcing an ill-fitting reuse.
// ---------------------------------------------------------------------------

interface RawReminderIntent {
  kind: 'relative' | 'absolute';
  offsetMinutes?: number;
  date?: string;
  time?: string;
}

interface RawRecurrenceIntent {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  daysOfWeek?: number[];
  endDate?: string;
}

interface RawSuggestion {
  type: 'task' | 'event';
  title: string;
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  priority?: BrainDumpSuggestion['priority'];
  category?: BrainDumpSuggestion['category'];
  estimatedMinutes?: number;
  eventType?: BrainDumpSuggestion['eventType'];
  location?: string;
  confidence?: number;
  reminder?: RawReminderIntent;
  recurrence?: RawRecurrenceIntent;
}

let nextClientId = 0;
function makeClientId(): string {
  nextClientId += 1;
  return `suggestion-${Date.now()}-${nextClientId}`;
}

/**
 * Converts the Edge Function's reminder INTENT into the exact same
 * ReminderPickerValue shape the existing Add Task/Event reminder picker
 * uses, so the Review card can embed that real component unchanged. The
 * actual remind_at timestamp is only ever computed at save time (see
 * BrainDumpPage.tsx), the same way AddTaskSheet/AddEventSheet already do
 * it — never frozen here at extraction time.
 */
function reminderIntentToPickerValue(intent: RawReminderIntent | undefined): ReminderPickerValue {
  if (!intent) return emptyReminderValue();

  if (intent.kind === 'absolute' && intent.date && intent.time) {
    return { preset: 'custom', customDate: intent.date, customTime: intent.time };
  }

  if (intent.kind === 'relative' && typeof intent.offsetMinutes === 'number') {
    return { preset: presetForOffset(intent.offsetMinutes), customDate: '', customTime: '' };
  }

  return emptyReminderValue();
}

/**
 * Converts the Edge Function's recurrence INTENT into the exact same
 * RecurrencePickerValue shape the existing Add Task/Event recurrence
 * picker uses, so the Review card can embed that real component
 * unchanged — no second recurrence representation. endDate maps to ''
 * (never-ending) when absent, matching RecurrencePickerValue's own
 * convention exactly.
 */
function recurrenceIntentToPickerValue(intent: RawRecurrenceIntent | undefined): RecurrencePickerValue {
  if (!intent) return emptyRecurrenceValue();
  return {
    type: intent.type,
    daysOfWeek: intent.type === 'custom' ? intent.daysOfWeek ?? [] : [],
    endDate: intent.endDate ?? '',
  };
}

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof context === 'object' && 'json' in context) {
    try {
      const body = await (context as { json: () => Promise<{ error?: string }> }).json();
      if (body?.error) return body.error;
    } catch {
      // Response body wasn't JSON or already consumed — fall through.
    }
  }
  return null;
}

export async function organizeBrainDump(text: string, workingDays: number[]): Promise<BrainDumpSuggestion[]> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const { data, error } = await supabase.functions.invoke('brain-dump', {
    body: { text, localDate, localTime, workingDays },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[brainDumpApi] organize failed', error);
    const forwardedMessage = await extractFunctionErrorMessage(error);
    throw new Error(forwardedMessage || "Timo couldn't organize that right now. Try again.");
  }

  const suggestions = (data?.suggestions ?? []) as RawSuggestion[];
  return suggestions.map((s) => {
    const { reminder, recurrence, ...rest } = s;
    return {
      ...rest,
      id: makeClientId(),
      included: true,
      reminder: reminderIntentToPickerValue(reminder),
      recurrence: recurrenceIntentToPickerValue(recurrence),
    };
  });
}
